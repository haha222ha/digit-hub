/**
 * 自动登录服务 — 对标原版 KefuAutoLogin + SubLogin + ServiceTicket
 */
import { session, WebContents, Cookie } from 'electron'
import { LoggerService } from './logger.service'
import { StorageService } from './storage.service'
import { InjectService } from './inject.service'
import { encrypt, decrypt } from '../utils/crypto'
import { partitionForShop } from '../utils/shop-partition'
import { safeLoadURL } from '../utils/safe-load-url'

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
const EVA_COOKIE_URL = 'https://walle.xiaohongshu.com/'

/** 拒绝 undefined/null/过短/哨兵值/设备串，防止写出 walle-eva-auth=not_found!!… */
export function isUsableAuthToken(v: unknown): boolean {
  const s = String(v ?? '').trim()
  if (!s || s.length < 16) return false
  if (/^(undefined|null|nan)$/i.test(s)) return false
  if (/not[_-]?found/i.test(s)) return false
  if (/^a1:/i.test(s)) return false
  if (/^(true|false|ok|error|fail)$/i.test(s)) return false
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
  /** 用户主动退出后，禁止自动用存档密码再登回去 */
  private logoutHold = new Set<string>()

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

  private async navigateToLoginIfNeeded(webContents: WebContents, _targetUrl: string, force = false): Promise<void> {
    const currentUrl = webContents.getURL()
    if (!force && (this.isWorkbenchUrl(currentUrl) || (await this.isWorkbenchShellReady(webContents)))) {
      this.logger.warn(`[KefuAutoLogin] 已在工作台，拒绝跳登录页: ${currentUrl}`)
      return
    }
    if (currentUrl.includes('/cstools/login') && !currentUrl.includes('customer.xiaohongshu.com')) {
      this.logger.info(`[KefuAutoLogin] 已在客服登录页: ${currentUrl}`)
      await this.waitForLoginForm(webContents, 12000)
      return
    }
    this.logger.info(`[KefuAutoLogin] 跳转客服登录页: ${XHS_LOGIN_URL}`)
    await safeLoadURL(webContents, XHS_LOGIN_URL, {
      label: 'navigate-login',
      logger: this.logger,
      timeoutMs: 20000
    })
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

  private getSession(shopId?: string) {
    return session.fromPartition(partitionForShop(shopId))
  }

  holdLogout(shopId: string): void {
    this.logoutHold.add(shopId)
  }

  clearLogoutHold(shopId: string): void {
    this.logoutHold.delete(shopId)
  }

  isLogoutHeld(shopId: string): boolean {
    return this.logoutHold.has(shopId)
  }

  async clearShopSession(shopId: string): Promise<void> {
    const ses = this.getSession(shopId)
    await ses.clearStorageData()
    this.storage.deleteShopCookies(shopId)
    this.holdLogout(shopId)
    this.lastCsaOkAt = 0
    this.logger.info(`[AutoLogin] 已退出店铺会话 shopId=${shopId}`)
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
   * 登录检测（对齐阿奇锁 / 千帆）：
   * - SPA 近期 get_csa 业务成功 / 工作台壳已渲染 → 已登录
   * - 裸 fetch get_csa 常因缺 x-s 签名 401，不能单独用来踢登录
   */
  async checkLoginStatus(webContents: WebContents): Promise<boolean> {
    try {
      const url = webContents.getURL()
      if (
        !url ||
        url === 'about:blank' ||
        url.includes('/cstools/login') ||
        url.includes('customer.xiaohongshu.com/login')
      ) {
        return false
      }

      // 1) SPA 拦截器刚报过 get_csa success
      if (this.lastCsaOkAt > 0 && Date.now() - this.lastCsaOkAt < 15 * 60 * 1000) {
        if (this.isWorkbenchUrl(url) || (await this.isWorkbenchShellReady(webContents))) {
          return true
        }
      }

      // 2) 工作台壳已出（店名/会话区）—— 与「自动退出」对抗的核心
      if (await this.isWorkbenchShellReady(webContents)) {
        this.logger.info('[AutoLogin] 工作台壳已就绪，保持登录（不因裸 fetch 401 踢出）')
        return true
      }

      // 3) 裸 API / soft SSO
      const apiCheck = await this.verifySessionViaApi(webContents)
      if (apiCheck.ok) {
        await this.syncEvaAuthCookies(webContents)
        return true
      }

      if (await this.hasSsoSessionCookies() || (await this.hasValidWalleEvaAuthCookie())) {
        this.logger.info('[AutoLogin] 有 SSO/合法 eva-auth，保持登录')
        return true
      }

      this.logger.warn('[AutoLogin] 无工作台壳且无鉴权 Cookie，判定未登录')
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

  async clickLoginButton(webContents: WebContents): Promise<{ ok: boolean; captcha?: boolean; reason?: string }> {
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
      return result || { ok: false }
    } catch {
      return { ok: false }
    }
  }

  async isCaptchaVisible(webContents: WebContents): Promise<boolean> {
    try {
      return !!(await webContents.executeJavaScript(`
        (function() {
          if (window.__xhsLoginHelper && window.__xhsLoginHelper.isCaptchaVisible) {
            return window.__xhsLoginHelper.isCaptchaVisible();
          }
          const t = (document.body && document.body.innerText) || '';
          return /安全验证|请选择最符合描述/.test(t);
        })()
      `))
    } catch {
      return false
    }
  }

  async ensureCaptchaClickable(webContents: WebContents): Promise<void> {
    try {
      await webContents.executeJavaScript(`
        (function() {
          if (window.__xhsLoginHelper && window.__xhsLoginHelper.ensureCaptchaClickable) {
            window.__xhsLoginHelper.ensureCaptchaClickable();
          }
          document.querySelectorAll('iframe').forEach(function(f) {
            f.style.setProperty('pointer-events', 'auto', 'important');
            f.style.setProperty('z-index', '2147483646', 'important');
          });
          return true;
        })()
      `)
      webContents.focus()
    } catch {
      // ignore
    }
  }

  /**
   * 对标官方千帆 setAutoLoginCookies：
   * 从页面 localStorage / sessionStorage / cookie / session 取出 token，写入 walle-eva-auth
   */
  async syncEvaAuthCookies(webContents: WebContents): Promise<boolean> {
    try {
      if (webContents.isDestroyed()) return false
      // 先清页面里的 not_found 哨兵，避免再次写脏 Cookie
      await webContents.executeJavaScript(`
        (function() {
          try {
            ['auth-token','authToken','accessToken','access_token'].forEach(function(k) {
              var v = localStorage.getItem(k);
              if (v && /not[_-]?found|undefined|null/i.test(String(v))) localStorage.removeItem(k);
            });
          } catch (e) {}
          return true;
        })()
      `).catch(() => null)

      const tokens = await webContents.executeJavaScript(`
        (function() {
          function usable(v) {
            var s = String(v == null ? '' : v).trim();
            if (!s || s.length < 16) return false;
            if (/^(undefined|null|nan)$/i.test(s)) return false;
            if (/not[_-]?found/i.test(s)) return false;
            if (/^a1:/i.test(s)) return false;
            return true;
          }
          function dig(obj, keys, depth) {
            if (!obj || depth > 4) return '';
            if (typeof obj === 'string') return '';
            for (const k of keys) {
              if (usable(obj[k])) return String(obj[k]);
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
          const authKeys = ['auth-token','authToken','auth_token'];
          const accessKeys = ['accessToken','access_token','access-token'];
          const userKeys = ['bUserId','b_user_id','userId','user_id','sellerId'];
          let authToken = '';
          let accessToken = '';
          let bUserId = '';
          for (const bag of [ls, ss]) {
            if (!authToken && usable(bag['auth-token'])) authToken = bag['auth-token'];
            if (!authToken && usable(bag['authToken'])) authToken = bag['authToken'];
            if (!accessToken && usable(bag['accessToken'])) accessToken = bag['accessToken'];
            if (!accessToken && usable(bag['access_token'])) accessToken = bag['access_token'];
            if (!bUserId && bag['bUserId']) bUserId = bag['bUserId'];
            if (!bUserId && bag['walle-eva-bUserId']) bUserId = bag['walle-eva-bUserId'];
          }
          for (const bag of [ls, ss]) {
            for (const [k, raw] of Object.entries(bag)) {
              if (!raw || raw.length < 8 || (raw[0] !== '{' && raw[0] !== '[')) continue;
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
          // 工作台是否已渲染（有店名/会话壳，不是登录表单）
          const onWorkbench = /walle\\.xiaohongshu\\.com\\/cstools\\//.test(location.href)
            && !/\\/login/.test(location.href)
            && !document.querySelector('input[type="password"]');
          return {
            authToken, accessToken, bUserId, cookieAuth, onWorkbench,
            lsKeys: Object.keys(ls).slice(0, 50)
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

      // 补充：从 Electron session 里的 SSO / access-token-* Cookie 抠
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

      // 若只有 access、没有独立 auth：禁止写成 AT!!AT（千帆要求两段真实 token，双写会污染会话导致自动退出）
      if (!isUsableAuthToken(authToken) && isUsableAuthToken(accessToken)) {
        const existing = await this.hasValidWalleEvaAuthCookie()
        if (existing) {
          this.logger.info('[AutoLogin] 缺独立 auth-token，保留已有合法 walle-eva-auth')
          return true
        }
        this.logger.warn('[AutoLogin] 缺独立 auth-token，跳过写 Cookie（避免 AT!!AT 污染）')
        return false
      }

      if (!isUsableAuthToken(authToken) || !isUsableAuthToken(accessToken)) {
        this.logger.warn(
          `[AutoLogin] 无可用 auth/access token，跳过写 walle-eva-auth；lsKeys=${(tokens?.lsKeys || []).join(',')}`
        )
        return false
      }

      // 两段相同也视为不完整（常见于只抠到 access）
      if (authToken === accessToken) {
        const existing = await this.hasValidWalleEvaAuthCookie()
        if (existing) {
          this.logger.info('[AutoLogin] auth===access，保留已有合法 Cookie，不覆盖')
          return true
        }
        this.logger.warn('[AutoLogin] auth===access 且无旧 Cookie，暂不写入')
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

  /** 仅删除脏 walle-eva-auth（含 not_found/undefined），不动其它 Cookie */
  async purgePollutedEvaAuthCookies(): Promise<void> {
    const ses = this.getSession()
    const cookies = await ses.cookies.get({ name: 'walle-eva-auth' })
    for (const c of cookies) {
      const parts = String(c.value || '').split('!!')
      const bad =
        parts.length < 2 || !isUsableAuthToken(parts[0]) || !isUsableAuthToken(parts[1])
      if (!bad) continue
      try {
        const url = `https://${String(c.domain || 'xiaohongshu.com').replace(/^\./, '')}${c.path || '/'}`
        await ses.cookies.remove(url, c.name)
        await ses.cookies.remove(EVA_COOKIE_URL, 'walle-eva-auth')
        this.logger.warn(`[AutoLogin] 已删除脏 walle-eva-auth: ${String(c.value).slice(0, 40)}`)
      } catch {
        // ignore
      }
    }
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

  /** 清除假成功落库的 Cookie 文件（无 SSO / 合法 eva-auth / access-token） */
  purgeInvalidStoredCookies(shopId: string): void {
    try {
      const encrypted = this.storage.getShopCookies(shopId)
      if (!encrypted) return
      const parsed = JSON.parse(decrypt(encrypted))
      const cookies: Cookie[] = Array.isArray(parsed) ? parsed : parsed?.cookies || []
      const names = new Set(cookies.map((c) => c.name))
      const hasSso = SSO_COOKIES.some((n) => names.has(n))
      const eva = cookies.find((c) => c.name === 'walle-eva-auth')
      const parts = String(eva?.value || '').split('!!')
      const hasGoodAuth =
        parts.length >= 2 && isUsableAuthToken(parts[0]) && isUsableAuthToken(parts[1])
      const hasAccess = cookies.some(
        (c) => /access-token/i.test(c.name || '') && isUsableAuthToken(c.value)
      )
      if (!hasSso && !hasGoodAuth && !hasAccess) {
        this.storage.saveShopCookies(shopId, '')
        this.logger.warn(`[AutoLogin] 已清除假成功 Cookie 存档 shopId=${shopId}`)
      }
    } catch {
      // ignore
    }
  }

  /** 页面已在客服工作台壳子（有店名/会话区），即使 get_csa 裸请求 401 也应允许保存保活 */
  async isWorkbenchShellReady(webContents: WebContents): Promise<boolean> {
    try {
      if (webContents.isDestroyed()) return false
      const url = webContents.getURL()
      if (!this.isWorkbenchUrl(url)) return false
      return !!(await webContents.executeJavaScript(`
        (function() {
          if (/\\/login/.test(location.href)) return false;
          if (document.querySelector('input[type="password"]')) return false;
          const text = (document.body && document.body.innerText) || '';
          // 工作台特征：当前会话 / 店 / 离线|在线
          return /当前会话|客服|工作台/.test(text) || text.length > 80;
        })()
      `))
    } catch {
      return false
    }
  }

  async hasAccessTokenCookie(): Promise<boolean> {
    const cookies = await this.getSession().cookies.get({})
    return cookies.some(
      (c) => /access-token/i.test(c.name || '') && isUsableAuthToken(c.value)
    )
  }

  async saveCookies(shopId: string, webContents?: WebContents): Promise<boolean> {
    try {
      if (!webContents) {
        this.logger.warn('[AutoLogin] 保存 Cookie 必须带 webContents')
        return false
      }

      // 只删脏 walle-eva-auth，禁止在保存时清空整站 Cookie
      await this.purgePollutedEvaAuthCookies()
      await this.syncEvaAuthCookies(webContents)

      const shellOk = await this.isWorkbenchShellReady(webContents)
      const valid = await this.verifySessionViaApi(webContents)
      const hasSso = await this.hasSsoSessionCookies()
      const hasGoodAuth = await this.hasValidWalleEvaAuthCookie()
      const hasAccess = await this.hasAccessTokenCookie()

      if (!valid.ok && !hasSso && !shellOk) {
        this.logger.warn('[AutoLogin] get_csa 失败且不在工作台壳，拒绝保存')
        return false
      }
      if (!valid.ok && shellOk) {
        this.logger.warn(
          '[AutoLogin] get_csa 裸请求未通过，但工作台壳已就绪，仍保存 Cookie 用于保活'
        )
      } else if (valid.soft) {
        this.logger.info('[AutoLogin] soft-ok，继续保存 Cookie')
      }

      const cookies = await this.getSession().cookies.get({})
      const xhsCookies = cookies.filter(
        (c) => c.domain?.includes('xiaohongshu.com') || c.domain?.includes('xhscdn.com')
      )

      const names = new Set(xhsCookies.map((c) => c.name))
      if (!hasSso && !hasGoodAuth && !hasAccess && !shellOk) {
        this.logger.warn(
          `[AutoLogin] 无可保活证据，拒绝保存；现有=${[...names].join(',')}`
        )
        return false
      }

      // 附带保存页面 localStorage 关键项，供下次注入
      let lsSnapshot: Record<string, string> = {}
      try {
        lsSnapshot = (await webContents.executeJavaScript(`
          (function() {
            var out = {};
            try {
              ['auth-token','authToken','accessToken','access_token','bUserId','walle-eva-bUserId'].forEach(function(k) {
                var v = localStorage.getItem(k);
                if (v && !/not[_-]?found|undefined|null/i.test(v) && v.length >= 8) out[k] = v;
              });
            } catch (e) {}
            return out;
          })()
        `)) as Record<string, string>
      } catch {
        lsSnapshot = {}
      }

      const encrypted = encrypt(
        JSON.stringify({
          cookies: xhsCookies,
          localStorage: lsSnapshot,
          savedAt: Date.now(),
          pageUrl: webContents.getURL()
        })
      )
      this.storage.saveShopCookies(shopId, encrypted)
      this.logger.info(
        `[AutoLogin] Cookie 已保存: shopId=${shopId}, count=${xhsCookies.length}, ls=${Object.keys(lsSnapshot).join(',') || '-'}, shell=${shellOk}, sso=${hasSso}, auth=${hasGoodAuth}`
      )
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

      const parsed = JSON.parse(decrypt(encrypted))
      const cookies: Cookie[] = Array.isArray(parsed) ? parsed : parsed?.cookies || []
      const lsSnapshot: Record<string, string> =
        !Array.isArray(parsed) && parsed?.localStorage ? parsed.localStorage : {}
      const names = new Set(cookies.map((c) => c.name))
      const hasSso = SSO_COOKIES.some((n) => names.has(n))
      const eva = cookies.find((c) => c.name === 'walle-eva-auth')
      const parts = String(eva?.value || '').split('!!')
      const hasGoodAuth =
        parts.length >= 2 && isUsableAuthToken(parts[0]) && isUsableAuthToken(parts[1])
      const hasAccess = cookies.some(
        (c) => /access-token/i.test(c.name || '') && isUsableAuthToken(c.value)
      )
      if (!hasSso && !hasGoodAuth && !hasAccess && Object.keys(lsSnapshot).length === 0) {
        this.logger.warn('[AutoLogin] 存档无可保活字段，丢弃并要求重新登录')
        this.storage.saveShopCookies(shopId, '')
        return false
      }

      const ses = this.getSession()

      for (const cookie of cookies) {
        try {
          // 跳过脏 walle-eva-auth
          if (cookie.name === 'walle-eva-auth') {
            const p = String(cookie.value || '').split('!!')
            if (p.length < 2 || !isUsableAuthToken(p[0]) || !isUsableAuthToken(p[1])) continue
          }
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

      // localStorage 在页面加载后由 inject 写入；先挂到 global 供 did-finish-load 使用
      ;(global as any).__xhsPendingLsSnapshot = lsSnapshot

      this.logger.info(
        `[AutoLogin] Cookie 已注入: shopId=${shopId}, count=${cookies.length}, ls=${Object.keys(lsSnapshot).length}`
      )
      return true
    } catch (error) {
      this.logger.error('[AutoLogin] 加载 Cookie 失败:', error)
      return false
    }
  }

  /** 页面加载后把存档的 localStorage 写回（配合 loadAndInjectCookies） */
  async applyPendingLocalStorage(webContents: WebContents): Promise<void> {
    const snap = (global as any).__xhsPendingLsSnapshot as Record<string, string> | undefined
    if (!snap || !Object.keys(snap).length || webContents.isDestroyed()) return
    try {
      await webContents.executeJavaScript(`
        (function(data) {
          try {
            Object.keys(data || {}).forEach(function(k) {
              if (data[k] && !/not[_-]?found|undefined|null/i.test(data[k])) {
                localStorage.setItem(k, data[k]);
              }
            });
          } catch (e) {}
          return true;
        })(${JSON.stringify(snap)})
      `)
      this.logger.info(`[AutoLogin] 已写回 localStorage: ${Object.keys(snap).join(',')}`)
    } catch (e) {
      this.logger.warn(`[AutoLogin] 写回 localStorage 失败: ${e}`)
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

    if (this.isLogoutHeld(shopId)) {
      this.logger.info(`[KefuAutoLogin] 用户已退出 ${shopId}，跳过自动登录，停留登录页`)
      await this.navigateToLoginIfNeeded(webContents, targetUrl, true)
      this.isLoginInProgress = false
      return false
    }

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
        await safeLoadURL(webContents, targetUrl, {
          label: 'cookie-inject-nav',
          logger: this.logger,
          timeoutMs: 25000
        })
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
        // 对齐阿奇锁：已在工作台则保活，绝不因「没存邮箱密码」踢回登录
        if (
          this.isWorkbenchUrl(webContents.getURL()) ||
          (await this.isWorkbenchShellReady(webContents)) ||
          (this.lastCsaOkAt > 0 && Date.now() - this.lastCsaOkAt < 15 * 60 * 1000)
        ) {
          this.logger.warn('[SubLogin] 账号密码为空，但会话仍有效，保持工作台不跳登录')
          await this.saveCookies(shopId, webContents)
          return true
        }
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
          await safeLoadURL(webContents, XHS_LOGIN_URL, {
            label: 'form-missing-relogin',
            logger: this.logger
          })
        }
        return false
      }

      await this.delay(500)
      await this.clickLoginButton(webContents)

      let captchaNotified = false
      // 3) 等待跳转出 login；若出验证码则拉长等待并禁止再点登录
      const afterLoginTarget =
        targetUrl.includes('/cstools/login') ? XHS_DASHBOARD_URL : (targetUrl || XHS_DASHBOARD_URL)
      for (let i = 0; i < 90; i++) {
        await this.delay(1000)
        const currentUrl = webContents.getURL()
        const captcha = await this.isCaptchaVisible(webContents)
        if (captcha) {
          if (!captchaNotified) {
            captchaNotified = true
            this.logger.warn('[KefuAutoLogin] 检测到安全验证，请在弹出窗口中手动点选')
            const openAssist = (global as any).openLoginAssistWindow as
              | ((reason?: string) => Promise<unknown>)
              | undefined
            if (openAssist) await openAssist('captcha')
          }
          if (i % 5 === 0) await this.ensureCaptchaClickable(webContents)
          continue
        }
        this.logger.info(`[KefuAutoLogin] 等待登录跳转 ${i + 1}/90: ${currentUrl}`)

        if (currentUrl.includes('walle.xiaohongshu.com') && !currentUrl.includes('/login')) {
          if (await this.checkLoginStatus(webContents)) {
            this.logger.info('[KefuAutoLogin] ✅ 自动登录成功，进入客服工作台')
            if (!currentUrl.startsWith(afterLoginTarget.split('?')[0])) {
              await safeLoadURL(webContents, afterLoginTarget, {
                label: 'after-login-target',
                logger: this.logger
              })
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
      // 对齐阿奇锁 HandleServiceTicket：失败时若仍在工作台则保活，禁止踢登录
      if (
        this.isWorkbenchUrl(url) ||
        (await this.isWorkbenchShellReady(webContents)) ||
        (await this.hasSsoSessionCookies()) ||
        (await this.hasValidWalleEvaAuthCookie()) ||
        (this.lastCsaOkAt > 0 && Date.now() - this.lastCsaOkAt < 15 * 60 * 1000)
      ) {
        this.logger.warn(
          '[KefuAutoLogin] ServiceTicket/get_csa 业务未成功，但会话仍有效，不重登录'
        )
        return
      }
      this.logger.warn('[KefuAutoLogin] ServiceTicket 响应失败且无会话，仅提示需登录（不强制刷页）')
      return
    }
    this.logger.info('[KefuAutoLogin] HandleServiceTicketResponseAsync 成功')
    await this.saveCookies(shopId, webContents)
  }

  async checkAndRefreshCookie(shopId: string, webContents: WebContents, dashboardUrl: string): Promise<void> {
    // 工作台壳在就续期/保存，绝不因裸 fetch 401 跳登录
    if (await this.isWorkbenchShellReady(webContents)) {
      await this.saveCookies(shopId, webContents)
      return
    }
    const valid = await this.checkLoginStatus(webContents)
    if (!valid) {
      this.logger.warn('[KefuBrowser] 会话失效，尝试自动恢复（有凭证才填表；无凭证不踢页）')
      await this.tryAutoLoginIfNeeded(shopId, webContents, dashboardUrl)
      return
    }

    const api = await this.verifySessionViaApi(webContents)
    if (!api.ok) {
      await this.refreshServiceTicket(webContents)
    }
  }

  async clearCookies(): Promise<void> {
    await this.clearShopSession(String((global as any).currentShopId || 'default'))
  }
}
