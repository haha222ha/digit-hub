/**
 * 自动登录服务 — 对标原版 KefuAutoLogin + SubLogin + ServiceTicket
 */
import { session, WebContents, Cookie } from 'electron'
import { LoggerService } from './logger.service'
import { StorageService } from './storage.service'
import { InjectService } from './inject.service'
import { encrypt, decrypt } from '../utils/crypto'

export const XHS_DASHBOARD_URL = 'https://walle.xiaohongshu.com/cstools/seller/dashboard'
export const XHS_CHAT_URL = 'https://walle.xiaohongshu.com/cstools/chat'
/** 与阿奇锁 LoginUrl 对齐：客服工作台登录页（不是商家上架 ark 后台） */
export const XHS_LOGIN_URL = 'https://walle.xiaohongshu.com/cstools/login'

/** 真正代表客服会话的 Cookie（假登录常用 a1/webId，不能当成功） */
const AUTH_COOKIES = ['walle-eva-auth', 'web_session', 'customer-shop-sid']
/** 服务端下发的 SSO 会话（缺这些时 SPA get_csa 必 401 → 弹「登录认证已过期」） */
const SSO_COOKIES = ['web_session', 'customer-shop-sid']
/** 辅助字段，仅作补充，不能单独判定登录成功 */
const AUX_COOKIES = ['a1', 'webId', 'xhsappid', 'xsecappid']
const KEY_COOKIES = [...AUTH_COOKIES, ...AUX_COOKIES]
const SESSION_PARTITION = 'persist:main'
const EVA_COOKIE_URL = 'https://walle.xiaohongshu.com/'

/** 拒绝 undefined/null/过短/设备串，防止写出 walle-eva-auth=undefined!!… */
export function isUsableAuthToken(v: unknown): boolean {
  const s = String(v ?? '').trim()
  if (!s || s.length < 16) return false
  if (/^(undefined|null|nan)$/i.test(s)) return false
  if (/^a1:/i.test(s)) return false
  return true
}

export function buildSsoLoginUrl(serviceUrl: string): string {
  // 阿奇锁直接打开 cstools/login；仅当目标不是 login 时才走 ark SSO 中转
  const target = (serviceUrl || '').trim() || XHS_DASHBOARD_URL
  if (target.includes('/cstools/login')) return XHS_LOGIN_URL
  return `https://ark.xiaohongshu.com/ark/login?service=${encodeURIComponent(target)}`
}

export interface LoginCredentials {
  email: string
  password: string
  source: 'sub_account' | 'main'
}

export class AutoLoginService {
  private logger: LoggerService
  private storage: StorageService
  private injectService: InjectService | null
  private loginRetryCount = 0
  private maxLoginRetry = 3
  private isLoginInProgress = false
  /** SPA 已成功打通 get_csa_info 的时间戳（裸 fetch 常因缺签名失败，不能单独否决） */
  private lastCsaOkAt = 0

  constructor(logger: LoggerService, storage: StorageService, injectService?: InjectService) {
    this.logger = logger
    this.storage = storage
    this.injectService = injectService || null
  }

  /** 由拦截器 / webRequest 在真实 get_csa_info 200 时打点 */
  markCsaSuccess(): void {
    this.lastCsaOkAt = Date.now()
  }

  private async ensureLoginHelper(webContents: WebContents): Promise<void> {
    if (this.injectService) {
      await this.injectService.injectLoginHelper(webContents)
    }
    await this.delay(300)
  }

  private isOnLoginPage(url: string): boolean {
    return url.includes('customer.xiaohongshu.com') ||
      url.includes('ark.xiaohongshu.com') ||
      url.includes('/login')
  }

  private async navigateToLoginIfNeeded(webContents: WebContents, targetUrl: string): Promise<void> {
    const currentUrl = webContents.getURL()
    if (
      currentUrl.includes('/cstools/login') ||
      currentUrl.includes('customer.xiaohongshu.com')
    ) {
      this.logger.info(`[KefuAutoLogin] 已在客服登录页: ${currentUrl}`)
      await this.waitForLoginForm(webContents, 12000)
      return
    }
    const loginUrl =
      targetUrl.includes('/cstools/login') || !targetUrl
        ? XHS_LOGIN_URL
        : buildSsoLoginUrl(targetUrl.includes('/login') ? XHS_DASHBOARD_URL : targetUrl)
    this.logger.info(`[KefuAutoLogin] 跳转客服登录页: ${loginUrl}`)
    await webContents.loadURL(loginUrl.includes('/cstools/login') ? XHS_LOGIN_URL : loginUrl)
    await this.waitForLoginForm(webContents, 15000)
  }

  private async waitForLoginForm(webContents: WebContents, timeoutMs: number): Promise<boolean> {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      if (webContents.isDestroyed()) return false
      try {
        await this.ensureLoginHelper(webContents)
        const ready = await webContents.executeJavaScript(`
          (function() {
            if (window.__xhsLoginHelper) {
              const r = window.__xhsLoginHelper.hideSubLoginElements();
              if (r && r.hasEmail) return true;
            }
            return !!(
              document.querySelector('input[type="email"], input[type="password"], input[placeholder*="邮箱"], input[placeholder*="账号"]')
            );
          })()
        `)
        if (ready) {
          this.logger.info('[KefuAutoLogin] 登录表单已就绪')
          return true
        }
      } catch {
        // 页面可能还在跳转
      }
      await this.delay(500)
    }
    this.logger.warn(`[KefuAutoLogin] 等待登录表单超时: ${webContents.getURL()}`)
    return false
  }

  private delay(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  private getSession() {
    return session.fromPartition(SESSION_PARTITION)
  }

  private isWorkbenchUrl(url: string): boolean {
    return (
      !!url &&
      url.includes('walle.xiaohongshu.com') &&
      !url.includes('/login') &&
      !url.includes('customer.xiaohongshu.com')
    )
  }

  /**
   * 调用 get_csa_info 验证 walle 域会话（对标 HandleServiceTicketResponseAsync）
   * 注意：裸 fetch 常缺 x-s/x-t 签名被业务层拒绝；此时若已在工作台且有 token，允许 soft-ok
   */
  async verifySessionViaApi(webContents: WebContents): Promise<{ ok: boolean; data?: unknown; soft?: boolean }> {
    try {
      const result = await webContents.executeJavaScript(`
        (function() {
          return fetch('https://walle.xiaohongshu.com/api/edith/mcs/get_csa_info', {
            credentials: 'include',
            headers: { 'Accept': 'application/json' }
          })
          .then(async r => {
            const text = await r.text();
            let d = null;
            try { d = JSON.parse(text); } catch (e) { d = { raw: text.slice(0, 200) }; }
            return { ok: true, http: r.status, data: d };
          })
          .catch(e => ({ ok: false, error: e.message }));
        })()
      `)
      if (!result?.ok) {
        return { ok: false }
      }
      const data = result.data as { success?: boolean; code?: number; data?: unknown; msg?: string }
      const valid = data?.success === true || (data?.code === 0 && !!data?.data)
      if (valid) {
        this.lastCsaOkAt = Date.now()
        this.logger.info('[KefuAutoLogin] ServiceTicket/get_csa_info 验证成功')
        return { ok: true, data: result.data }
      }

      // 裸 fetch 常缺签名；仅当有真实 SSO 会话 Cookie 时 soft-ok（禁止脏 walle-eva-auth 冒充）
      const url = webContents.getURL()
      if (this.isWorkbenchUrl(url) && (await this.hasSsoSessionCookies())) {
        this.logger.warn(
          `[AutoLogin] 裸 fetch get_csa_info 未通过(http=${result.http})，已有 SSO Cookie，soft-ok`
        )
        return { ok: true, soft: true, data: result.data }
      }

      this.logger.warn(
        `[AutoLogin] get_csa_info 未通过 http=${result.http} code=${data?.code} msg=${data?.msg || ''} body=${JSON.stringify(data).slice(0, 180)}`
      )
      return { ok: false, data: result.data }
    } catch (error) {
      this.logger.error('[AutoLogin] get_csa_info 验证异常:', error)
      return { ok: false }
    }
  }

  async hasValidKeyCookies(): Promise<boolean> {
    if (await this.hasSsoSessionCookies()) return true
    return this.hasValidWalleEvaAuthCookie()
  }

  /** web_session / customer-shop-sid — 登录真正成功的标志 */
  async hasSsoSessionCookies(): Promise<boolean> {
    const cookies = await this.getSession().cookies.get({})
    const names = new Set(
      cookies
        .filter((c) => /xiaohongshu\.com/i.test(String(c.domain || '')))
        .map((c) => c.name)
    )
    return SSO_COOKIES.some((n) => names.has(n))
  }

  /** 合法 walle-eva-auth = auth!!access，两段都必须可用 */
  async hasValidWalleEvaAuthCookie(): Promise<boolean> {
    const cookies = await this.getSession().cookies.get({ name: 'walle-eva-auth' })
    for (const c of cookies) {
      const parts = String(c.value || '').split('!!')
      if (parts.length >= 2 && isUsableAuthToken(parts[0]) && isUsableAuthToken(parts[1])) {
        return true
      }
    }
    return false
  }

  /**
   * 严格登录检测 — P0：仅认 get_csa_info 成功，禁止 a1/webId + DOM 假成功
   */
  async checkLoginStatus(webContents: WebContents): Promise<boolean> {
    try {
      const url = webContents.getURL()
      if (
        !url ||
        url === 'about:blank' ||
        url.includes('/login') ||
        url.includes('customer.xiaohongshu.com/login')
      ) {
        return false
      }

      const apiCheck = await this.verifySessionViaApi(webContents)
      if (apiCheck.ok) {
        // 登录成功后尽量把官方鉴权 Cookie 补齐
        await this.syncEvaAuthCookies(webContents)
        return true
      }
      this.logger.warn('[AutoLogin] get_csa_info 未通过，判定未登录（禁止 DOM/a1 假成功）')
      return false
    } catch (error) {
      this.logger.error('[AutoLogin] 检测登录状态失败:', error)
      return false
    }
  }

  getCredentials(shopId: string): LoginCredentials | null {
    const subs = this.storage.getSubAccounts(shopId)
    if (subs.length > 0) {
      const active = subs.find(s => s.status === 'active') || subs[0]
      const creds = this.storage.getSubAccountCredentials(active.id)
      if (creds) {
        return { email: creds.username, password: creds.password, source: 'sub_account' }
      }
    }

    const main = this.storage.getMainLoginInfo(shopId)
    if (main?.email) {
      return { email: main.email, password: main.password || '', source: 'main' }
    }

    return null
  }

  async hideSubLoginElements(webContents: WebContents): Promise<void> {
    try {
      await this.ensureLoginHelper(webContents)
      await webContents.executeJavaScript(`
        (function() {
          if (window.__xhsLoginHelper) {
            return window.__xhsLoginHelper.hideSubLoginElements();
          }
          return { ok: false, reason: 'helper_not_loaded' };
        })()
      `)
    } catch {
      // 页面可能尚未就绪
    }
  }

  async enterLoginCredentials(webContents: WebContents, email: string, password: string): Promise<boolean> {
    try {
      await this.ensureLoginHelper(webContents)
      const result = await webContents.executeJavaScript(`
        (function() {
          const email = ${JSON.stringify(email)};
          const password = ${JSON.stringify(password)};
          if (window.__xhsLoginHelper) {
            return window.__xhsLoginHelper.enterLoginInfo(email, password);
          }
          const input = document.querySelector('input[type="email"], input[name="email"], input[placeholder*="邮箱"]');
          if (!input) return { ok: false, reason: 'no_input' };
          input.value = email;
          input.dispatchEvent(new Event('input', { bubbles: true }));
          const pwd = document.querySelector('input[type="password"]');
          if (pwd && password) {
            pwd.value = password;
            pwd.dispatchEvent(new Event('input', { bubbles: true }));
          }
          return { ok: true };
        })()
      `)
      return !!result?.ok
    } catch (error) {
      this.logger.error('[AutoLogin] 填写登录信息失败:', error)
      return false
    }
  }

  async clickLoginButton(webContents: WebContents): Promise<boolean> {
    try {
      const result = await webContents.executeJavaScript(`
        (function() {
          if (window.__xhsLoginHelper) {
            return window.__xhsLoginHelper.clickLoginButton();
          }
          const btn = document.querySelector('button[type="submit"], .login-btn');
          if (btn) { btn.click(); return { ok: true }; }
          return { ok: false };
        })()
      `)
      return !!result?.ok
    } catch {
      return false
    }
  }

  /**
   * 对标官方千帆 setAutoLoginCookies：
   * 从页面 localStorage / sessionStorage / cookie / window 取出 token，写入 walle-eva-auth
   */
  async syncEvaAuthCookies(webContents: WebContents): Promise<boolean> {
    try {
      if (webContents.isDestroyed()) return false
      const tokens = await webContents.executeJavaScript(`
        (function() {
          function dig(obj, keys, depth) {
            if (!obj || depth > 4) return '';
            if (typeof obj === 'string') return '';
            for (const k of keys) {
              if (obj[k] != null && String(obj[k]).length > 4) return String(obj[k]);
            }
            for (const v of Object.values(obj)) {
              if (v && typeof v === 'object') {
                const hit = dig(v, keys, depth + 1);
                if (hit) return hit;
              }
            }
            return '';
          }
          const ls = {};
          const ss = {};
          try {
            for (let i = 0; i < localStorage.length; i++) {
              const k = localStorage.key(i);
              if (k) ls[k] = localStorage.getItem(k) || '';
            }
          } catch (e) {}
          try {
            for (let i = 0; i < sessionStorage.length; i++) {
              const k = sessionStorage.key(i);
              if (k) ss[k] = sessionStorage.getItem(k) || '';
            }
          } catch (e) {}
          const authKeys = ['auth-token','authToken','auth_token','token','Authorization'];
          const accessKeys = ['accessToken','access_token','access-token'];
          const userKeys = ['bUserId','b_user_id','userId','user_id','sellerId'];
          let authToken = ls['auth-token'] || ls['authToken'] || ss['auth-token'] || ss['authToken'] || '';
          let accessToken = ls['accessToken'] || ls['access_token'] || ss['accessToken'] || '';
          let bUserId = ls['bUserId'] || ls['walle-eva-bUserId'] || ss['bUserId'] || '';
          // 深挖 JSON 缓存
          for (const bag of [ls, ss]) {
            for (const [k, raw] of Object.entries(bag)) {
              if (!raw || raw.length < 8 || raw[0] !== '{' && raw[0] !== '[') continue;
              try {
                const j = JSON.parse(raw);
                if (!authToken) authToken = dig(j, authKeys, 0);
                if (!accessToken) accessToken = dig(j, accessKeys, 0);
                if (!bUserId) bUserId = dig(j, userKeys, 0);
              } catch (e) {}
            }
          }
          const m = document.cookie.match(/(?:^|;\\s*)walle-eva-auth=([^;]+)/);
          const cookieAuth = m ? decodeURIComponent(m[1]) : '';
          const mb = document.cookie.match(/(?:^|;\\s*)walle-eva-bUserId=([^;]+)/);
          if (!bUserId && mb) bUserId = decodeURIComponent(mb[1]);
          return {
            authToken, accessToken, bUserId, cookieAuth,
            lsKeys: Object.keys(ls).slice(0, 40)
          };
        })()
      `)

      let authToken = String(tokens?.authToken || '')
      let accessToken = String(tokens?.accessToken || '')
      let bUserId = String(tokens?.bUserId || '')

      if ((!isUsableAuthToken(authToken) || !isUsableAuthToken(accessToken)) && tokens?.cookieAuth) {
        const parts = String(tokens.cookieAuth).split('!!')
        if (parts.length >= 2) {
          if (!isUsableAuthToken(authToken)) authToken = parts[0]
          if (!isUsableAuthToken(accessToken)) accessToken = parts[1]
        }
      }

      // 补充：从 Electron session 里的 SSO Cookie 抠（登录后常有 access-token-walle…）
      if (!isUsableAuthToken(authToken) || !isUsableAuthToken(accessToken)) {
        const sesCookies = await this.getSession().cookies.get({})
        for (const c of sesCookies) {
          const n = c.name || ''
          const v = String(c.value || '')
          if (!isUsableAuthToken(v)) continue
          if (!isUsableAuthToken(accessToken) && /access-token/i.test(n)) accessToken = v
          if (!isUsableAuthToken(authToken) && (/^auth-token/i.test(n) || n === 'auth-token')) authToken = v
          if (!bUserId && /bUserId|user-id-walle/i.test(n)) bUserId = v
          if (n === 'walle-eva-auth' && v.includes('!!')) {
            const parts = v.split('!!')
            if (!isUsableAuthToken(authToken) && isUsableAuthToken(parts[0])) authToken = parts[0]
            if (!isUsableAuthToken(accessToken) && isUsableAuthToken(parts[1])) accessToken = parts[1]
          }
        }
      }

      if (!isUsableAuthToken(authToken) || !isUsableAuthToken(accessToken)) {
        this.logger.warn(
          `[AutoLogin] 无可用 auth/access token，跳过写 walle-eva-auth；lsKeys=${(tokens?.lsKeys || []).join(',')}`
        )
        return false
      }

      return this.applyEvaAuthTokens({ authToken, accessToken, bUserId })
    } catch (error) {
      this.logger.error('[AutoLogin] 同步 Eva 鉴权 Cookie 失败:', error)
      return false
    }
  }

  /** 从 get_csa_info / get_login_user 等 API 响应里抠 token */
  extractAuthFromPayload(payload: unknown): {
    authToken: string
    accessToken: string
    bUserId: string
  } {
    const empty = { authToken: '', accessToken: '', bUserId: '' }
    if (!payload || typeof payload !== 'object') return empty
    const dig = (obj: unknown, keys: string[], depth = 0): string => {
      if (!obj || depth > 5) return ''
      if (typeof obj !== 'object') return ''
      const rec = obj as Record<string, unknown>
      for (const k of keys) {
        const v = rec[k]
        if (v != null && isUsableAuthToken(v)) return String(v).trim()
      }
      for (const v of Object.values(rec)) {
        if (v && typeof v === 'object') {
          const hit = dig(v, keys, depth + 1)
          if (hit) return hit
        }
      }
      return ''
    }
    const root = payload as Record<string, unknown>
    const data = (root.data && typeof root.data === 'object' ? root.data : root) as Record<string, unknown>
    return {
      authToken: dig(data, ['authToken', 'auth_token', 'auth-token', 'accessAuthToken']),
      accessToken: dig(data, ['accessToken', 'access_token', 'access-token', 'accessTokenWalle']),
      bUserId: dig(data, ['bUserId', 'b_user_id', 'userId', 'user_id', 'sellerId'])
    }
  }

  /** 对标官方 setAutoLoginCookies — 写入 walle-eva-auth = auth!!access（两段都必须合法） */
  async applyEvaAuthTokens(opts: {
    authToken?: string
    accessToken?: string
    bUserId?: string
  }): Promise<boolean> {
    const authToken = String(opts.authToken || '').trim()
    const accessToken = String(opts.accessToken || '').trim()
    const bUserId = String(opts.bUserId || '').trim()
    if (!isUsableAuthToken(authToken) || !isUsableAuthToken(accessToken)) {
      this.logger.warn(
        `[AutoLogin] 拒绝写入脏 walle-eva-auth authLen=${authToken.length} accessLen=${accessToken.length} auth=${authToken.slice(0, 12)}`
      )
      return false
    }

    const ses = this.getSession()
    const value = `${authToken}!!${accessToken}`
    const expire = Math.floor(Date.now() / 1000) + 86400 * 30
    // 对标官方：url=https://walle.xiaohongshu.com/，不强制 domain；再补 eva/edith 便于跨子域
    const urls = [EVA_COOKIE_URL, 'https://eva.xiaohongshu.com/', 'https://edith.xiaohongshu.com/']
    for (const url of urls) {
      // 先清脏副本
      try {
        await ses.cookies.remove(url, 'walle-eva-auth')
        await ses.cookies.remove(url, 'walle-eva-bUserId')
      } catch {
        // ignore
      }
      await ses.cookies.set({
        url,
        name: 'walle-eva-auth',
        value,
        path: '/',
        secure: true,
        httpOnly: false,
        sameSite: 'no_restriction',
        expirationDate: expire
      })
      if (bUserId) {
        await ses.cookies.set({
          url,
          name: 'walle-eva-bUserId',
          value: bUserId,
          path: '/',
          secure: true,
          httpOnly: false,
          sameSite: 'no_restriction',
          expirationDate: expire
        })
      }
    }
    this.logger.info(
      `[AutoLogin] 已同步 walle-eva-auth（auth=${authToken.slice(0, 8)}…, access=${accessToken.slice(0, 8)}…, bUserId=${bUserId || '-'})`
    )
    return true
  }

  /** 启动时：清脏 walle-eva-auth；无 SSO 时清弱 Cookie */
  async clearWeakSessionCookies(): Promise<void> {
    const ses = this.getSession()
    const cookies = await ses.cookies.get({})
    let polluted = 0
    for (const c of cookies) {
      if (c.name !== 'walle-eva-auth') continue
      const parts = String(c.value || '').split('!!')
      const bad =
        parts.length < 2 || !isUsableAuthToken(parts[0]) || !isUsableAuthToken(parts[1])
      if (!bad) continue
      try {
        const url = `https://${String(c.domain || 'xiaohongshu.com').replace(/^\./, '')}${c.path || '/'}`
        await ses.cookies.remove(url, c.name)
        await ses.cookies.remove(EVA_COOKIE_URL, 'walle-eva-auth')
        polluted++
        this.logger.warn(`[AutoLogin] 已删除脏 walle-eva-auth: ${String(c.value).slice(0, 40)}`)
      } catch {
        // ignore
      }
    }

    const names = new Set((await ses.cookies.get({})).map((c) => c.name))
    const hasSso = SSO_COOKIES.some((n) => names.has(n))
    const hasGoodAuth = await this.hasValidWalleEvaAuthCookie()
    if (hasSso || hasGoodAuth) {
      this.logger.info(
        `[AutoLogin] session 鉴权正常: sso=${SSO_COOKIES.filter((n) => names.has(n)).join(',') || '-'} evaAuth=${hasGoodAuth}`
      )
      return
    }
    let removed = polluted
    for (const c of await ses.cookies.get({})) {
      if (!/xiaohongshu\.com|xhscdn\.com/i.test(String(c.domain || ''))) continue
      try {
        const url = `https://${(c.domain || 'xiaohongshu.com').replace(/^\./, '')}${c.path || '/'}`
        await ses.cookies.remove(url, c.name)
        removed++
      } catch {
        // ignore
      }
    }
    this.logger.warn(
      `[AutoLogin] 已清理 session Cookie ${removed} 个（无 web_session/customer-shop-sid/合法 walle-eva-auth），请重新登录客服邮箱`
    )
  }

  /** 清除假成功落库的 Cookie 文件（无 SSO / 合法 eva-auth） */
  purgeInvalidStoredCookies(shopId: string): void {
    try {
      const encrypted = this.storage.getShopCookies(shopId)
      if (!encrypted) return
      const cookies: Cookie[] = JSON.parse(decrypt(encrypted))
      const names = new Set(cookies.map((c) => c.name))
      const hasSso = SSO_COOKIES.some((n) => names.has(n))
      const eva = cookies.find((c) => c.name === 'walle-eva-auth')
      const parts = String(eva?.value || '').split('!!')
      const hasGoodAuth =
        parts.length >= 2 && isUsableAuthToken(parts[0]) && isUsableAuthToken(parts[1])
      if (!hasSso && !hasGoodAuth) {
        this.storage.saveShopCookies(shopId, '')
        this.logger.warn(`[AutoLogin] 已清除假成功 Cookie 存档 shopId=${shopId}`)
      }
    } catch {
      // ignore
    }
  }

  async saveCookies(shopId: string, webContents?: WebContents): Promise<boolean> {
    try {
      if (!webContents) {
        this.logger.warn('[AutoLogin] 保存 Cookie 必须带 webContents，且需 get_csa_info 成功')
        return false
      }
      await this.syncEvaAuthCookies(webContents)
      const valid = await this.verifySessionViaApi(webContents)
      if (!valid.ok) {
        const hasSso = await this.hasSsoSessionCookies()
        if (!hasSso) {
          this.logger.warn('[AutoLogin] get_csa_info 失败且无 SSO Cookie，拒绝保存')
          return false
        }
        this.logger.warn('[AutoLogin] get_csa_info 裸请求未通过，但已有 SSO Cookie，继续保存')
      } else if (valid.soft) {
        this.logger.info('[AutoLogin] soft-ok，继续保存 Cookie')
      }

      const cookies = await this.getSession().cookies.get({})
      const xhsCookies = cookies.filter(
        (c) => c.domain?.includes('xiaohongshu.com') || c.domain?.includes('xhscdn.com')
      )

      const names = new Set(xhsCookies.map((c) => c.name))
      const hasSso = SSO_COOKIES.some((n) => names.has(n))
      const hasGoodAuth = await this.hasValidWalleEvaAuthCookie()
      if (!hasSso && !hasGoodAuth) {
        this.logger.warn(
          `[AutoLogin] Cookie 无 SSO/合法 walle-eva-auth，拒绝保存；现有=${[...names].join(',')}`
        )
        return false
      }

      const encrypted = encrypt(JSON.stringify(xhsCookies))
      this.storage.saveShopCookies(shopId, encrypted)
      this.logger.info(`[AutoLogin] Cookie 已保存: shopId=${shopId}, count=${xhsCookies.length}`)
      return true
    } catch (error) {
      this.logger.error('[AutoLogin] 保存 Cookie 失败:', error)
      return false
    }
  }

  async loadAndInjectCookies(shopId: string): Promise<boolean> {
    try {
      const encrypted = this.storage.getShopCookies(shopId)
      if (!encrypted) {
        this.logger.warn(`[AutoLogin] 无保存的 Cookie: shopId=${shopId}`)
        return false
      }

      const cookies: Cookie[] = JSON.parse(decrypt(encrypted))
      const names = new Set(cookies.map((c) => c.name))
      const hasSso = SSO_COOKIES.some((n) => names.has(n))
      const eva = cookies.find((c) => c.name === 'walle-eva-auth')
      const parts = String(eva?.value || '').split('!!')
      const hasGoodAuth =
        parts.length >= 2 && isUsableAuthToken(parts[0]) && isUsableAuthToken(parts[1])
      if (!hasSso && !hasGoodAuth) {
        this.logger.warn('[AutoLogin] 存档 Cookie 无 SSO/合法 walle-eva-auth，丢弃并要求重新登录')
        this.storage.saveShopCookies(shopId, '')
        return false
      }

      const ses = this.getSession()

      for (const cookie of cookies) {
        try {
          const domain = (cookie.domain || '.xiaohongshu.com').replace(/^\./, '')
          const secure = cookie.secure !== false
          await ses.cookies.set({
            url: `https://${domain}${cookie.path || '/'}`,
            name: cookie.name,
            value: cookie.value,
            domain: cookie.domain,
            path: cookie.path || '/',
            secure,
            httpOnly: !!cookie.httpOnly,
            expirationDate: cookie.expirationDate,
            sameSite: (cookie as Cookie & { sameSite?: string }).sameSite === 'strict' ? 'strict'
              : (cookie as Cookie & { sameSite?: string }).sameSite === 'lax' ? 'lax'
              : 'no_restriction'
          })
        } catch {
          // 跳过无效 cookie
        }
      }

      this.logger.info(`[AutoLogin] Cookie 已注入: shopId=${shopId}, count=${cookies.length}`)
      return true
    } catch (error) {
      this.logger.error('[AutoLogin] 加载 Cookie 失败:', error)
      return false
    }
  }

  async refreshServiceTicket(webContents: WebContents): Promise<boolean> {
    const result = await this.verifySessionViaApi(webContents)
    if (result.ok) {
      this.logger.info('[AutoLogin] ServiceTicket 续期成功')
      return true
    }
    this.logger.warn('[AutoLogin] ServiceTicket 续期失败')
    return false
  }

  /**
   * 核心自动登录 — 对标 KefuAutoLogin + TryAutoLoginIfNeededAsync
   */
  async tryAutoLoginIfNeeded(
    shopId: string,
    webContents: WebContents,
    targetUrl: string = XHS_DASHBOARD_URL
  ): Promise<boolean> {
    if (this.isLoginInProgress) {
      this.logger.warn('[KefuAutoLogin] 登录正在进行中，跳过')
      return false
    }

    this.isLoginInProgress = true
    this.logger.info(`[KefuAutoLogin] 开始自动登录: shopId=${shopId}`)

    try {
      if (await this.checkLoginStatus(webContents)) {
        this.logger.info('[KefuAutoLogin] ✅ 已处于登录状态')
        await this.saveCookies(shopId, webContents)
        this.loginRetryCount = 0
        return true
      }

      // 1) 尝试 Cookie 注入
      const injected = await this.loadAndInjectCookies(shopId)
      if (injected) {
        await webContents.loadURL(targetUrl)
        await this.delay(3500)
        if (await this.checkLoginStatus(webContents)) {
          this.logger.info('[KefuAutoLogin] ✅ Cookie 注入登录成功')
          await this.saveCookies(shopId, webContents)
          this.loginRetryCount = 0
          return true
        }
      }

      const creds = this.getCredentials(shopId)
      if (!creds) {
        this.logger.warn('[SubLogin] 账号密码为空，回退为子账号手动登录')
        await this.navigateToLoginIfNeeded(webContents, targetUrl)
        return false
      }

      // 2) 客服登录页 + 邮箱（对齐阿奇锁：cstools/login，不是上架 ark 扫码）
      this.logger.info(`[KefuAutoLogin] 使用${creds.source === 'sub_account' ? '子账号' : '主账号'}邮箱登录`)
      await this.navigateToLoginIfNeeded(webContents, XHS_LOGIN_URL)
      await this.hideSubLoginElements(webContents)

      let filled = false
      for (let attempt = 0; attempt < 6; attempt++) {
        filled = await this.enterLoginCredentials(webContents, creds.email, creds.password)
        if (filled) break
        this.logger.warn(`[KefuAutoLogin] 表单未就绪，重试 ${attempt + 1}/6，url=${webContents.getURL()}`)
        await this.delay(1000)
        await this.hideSubLoginElements(webContents)
      }
      if (!filled) {
        this.logger.warn('[KefuAutoLogin] 未找到客服登录表单。请确认打开的是 walle/cstools/login，且使用客服邮箱（非上架扫码号）')
        // 强制再打开一次阿奇锁同款登录页，便于手动登录
        if (!webContents.getURL().includes('/cstools/login')) {
          await webContents.loadURL(XHS_LOGIN_URL)
        }
        return false
      }

      await this.delay(500)
      await this.clickLoginButton(webContents)

      // 3) 等待跳转出 login + ServiceTicket 生效
      const afterLoginTarget =
        targetUrl.includes('/cstools/login') ? XHS_DASHBOARD_URL : (targetUrl || XHS_DASHBOARD_URL)
      for (let i = 0; i < 30; i++) {
        await this.delay(1000)
        const currentUrl = webContents.getURL()
        this.logger.info(`[KefuAutoLogin] 等待登录跳转 ${i + 1}/30: ${currentUrl}`)

        if (currentUrl.includes('walle.xiaohongshu.com') && !currentUrl.includes('/login')) {
          if (await this.checkLoginStatus(webContents)) {
            this.logger.info('[KefuAutoLogin] ✅ 自动登录成功，进入客服工作台')
            if (!currentUrl.startsWith(afterLoginTarget.split('?')[0])) {
              await webContents.loadURL(afterLoginTarget)
              await this.delay(2000)
            }
            await this.saveCookies(shopId, webContents)
            this.loginRetryCount = 0
            return true
          }
        }
      }

      this.loginRetryCount++
      this.logger.warn(
        `[AutoLogin] ❌ 自动登录失败 (${this.loginRetryCount}/${this.maxLoginRetry})，当前页: ${webContents.getURL()}`
      )
      return false
    } catch (error) {
      this.logger.error('[AutoLogin] 自动登录异常:', error)
      return false
    } finally {
      this.isLoginInProgress = false
    }
  }

  /** 兼容旧接口 */
  async autoLogin(shopId: string, webContents: WebContents, dashboardUrl: string): Promise<boolean> {
    const ok = await this.tryAutoLoginIfNeeded(shopId, webContents, dashboardUrl)
    if (!ok && this.loginRetryCount < this.maxLoginRetry) {
      await this.delay(2000)
      return this.tryAutoLoginIfNeeded(shopId, webContents, dashboardUrl)
    }
    if (!ok) {
      this.logger.error('[AutoLogin] 已达最大重试次数，需要手动登录')
    }
    return ok
  }

  async loginWithSubAccount(subAccountId: number, webContents: WebContents, targetUrl: string): Promise<boolean> {
    const creds = this.storage.getSubAccountCredentials(subAccountId)
    if (!creds) {
      this.logger.warn('[SubLogin] 子账号凭证不存在')
      return false
    }
    this.storage.updateSubAccountLogin(subAccountId)
    const shopId = creds.shopId
    this.logger.info(`[SubLogin] 子账号登录: ${creds.username}`)
    return this.tryAutoLoginIfNeeded(shopId, webContents, targetUrl)
  }

  async handleServiceTicketFromPage(webContents: WebContents, shopId: string, success: boolean): Promise<void> {
    if (!success) {
      const url = webContents.getURL()
      if (this.isOnLoginPage(url)) {
        return
      }
      // get_csa_info 裸请求常 401（缺签名），禁止因此踢回登录——会冲掉已渲染的会话列表
      if (this.isWorkbenchUrl(url) || (await this.hasSsoSessionCookies())) {
        this.logger.warn(
          '[KefuAutoLogin] ServiceTicket/get_csa 业务未成功，但已在工作台或有 SSO Cookie，不重登录'
        )
        return
      }
      this.logger.warn('[KefuAutoLogin] ServiceTicket 响应失败且无会话，触发重登录')
      await this.tryAutoLoginIfNeeded(shopId, webContents, XHS_DASHBOARD_URL)
      return
    }
    this.logger.info('[KefuAutoLogin] HandleServiceTicketResponseAsync 成功')
    await this.saveCookies(shopId, webContents)
  }

  async checkAndRefreshCookie(shopId: string, webContents: WebContents, dashboardUrl: string): Promise<void> {
    const valid = await this.checkLoginStatus(webContents)
    if (!valid) {
      this.logger.warn('[KefuBrowser] Cookie 过期，队列已熔断，尝试自动登录')
      await this.tryAutoLoginIfNeeded(shopId, webContents, dashboardUrl)
      return
    }

    const api = await this.verifySessionViaApi(webContents)
    if (!api.ok) {
      await this.refreshServiceTicket(webContents)
    }
  }

  async clearCookies(): Promise<void> {
    await this.getSession().clearStorageData({ storages: ['cookies'] })
    this.logger.info('[AutoLogin] Cookie 已清除')
  }
}
