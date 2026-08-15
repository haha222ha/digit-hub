/**
 * 自动发货服务
 * - 对标阿奇锁：订单检测 → 商品绑定 → 卡密/文本 → XhsRim.sendTextMsg
 * - 订单源：fulfillment/order/page 轮询（不依赖阿奇云 WS）
 * - 发货：inject im-send.js → search_customer → getChatInfo → sendTextMsg
 */
import { BrowserWindow, WebContents, session } from 'electron'
import { StorageService } from './storage.service'
import { LoggerService } from './logger.service'
import { MockService } from './mock.service'
import { partitionForShop, currentShopId } from '../utils/shop-partition'
import type { InjectService } from './inject.service'
import {
  buildMessages,
  renderTemplate,
  needsCard,
  type TemplateContext
} from './template.service'
import { randomUUID } from 'crypto'
import { encrypt } from '../utils/crypto'
import type { PsyCloudService } from './psy-cloud.service'
import type { AgisoImManager } from '../agiso-im-manager'
import { ImWsCdpService } from './im-ws-cdp.service'
import { notifyDesktop } from '../notify'

/** 阿奇锁商品笔记列表页（有 accessToken + _webmsxyw） */
const ARK_GOODS_NOTE_LIST_URL = 'https://ark.xiaohongshu.com/app-note/note-list'
/** 对标 ProductAnalyzer 本店商品库「已上架」 */
const ARK_GOODS_SHELF_URL = 'https://ark.xiaohongshu.com/app-item/list/shelf'
/** 千帆订单查询页（HAR 同源：有 _webmsxyw，适合拉 fulfillment/order/page） */
const ARK_ORDER_QUERY_URL = 'https://ark.xiaohongshu.com/app-order/order/query'
/** dashboard 无 XhsRim 时，同 WebContents 后台切 chat（不新开窗，避免 CSA 互踢） */
const XHS_CHAT_URL = 'https://walle.xiaohongshu.com/cstools/chat'

function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    let done = false
    const t = setTimeout(() => {
      if (!done) {
        done = true
        resolve(fallback)
      }
    }, ms)
    p.then(
      (v) => {
        if (!done) {
          done = true
          clearTimeout(t)
          resolve(v)
        }
      },
      () => {
        if (!done) {
          done = true
          clearTimeout(t)
          resolve(fallback)
        }
      }
    )
  })
}

function isArkLoginUrl(url: string): boolean {
  if (!url) return true
  const u = url.toLowerCase()
  if (u.includes('customer.xiaohongshu.com')) return true
  if (u.includes('/ark/login')) return true
  if (u.includes('ark.xiaohongshu.com') && /\/login(\?|$|\/)/.test(u)) return true
  if (u.includes('walle.xiaohongshu.com') && u.includes('/login')) return true
  return false
}

function isArkAuthedUrl(url: string): boolean {
  if (!url || !url.includes('ark.xiaohongshu.com')) return false
  return !isArkLoginUrl(url)
}

export class AutoShipService {
  private storage: StorageService
  private logger: LoggerService
  private mock: MockService
  private injectService: InjectService | null = null
  private psyCloud: PsyCloudService | null = null
  private monitorInterval: NodeJS.Timeout | null = null
  private processedOrders: Set<string> = new Set()
  private isShipping = false
  private monitorWebContents: WebContents | null = null
  /** 阶段 A：与 monitor 同页（dashboard 单页 XhsRim）；显式客服窗为备选 */
  private imWebContents: WebContents | null = null
  /** 最近一次 IM 健康检查结果（get_csa + XhsRim） */
  private imHealthByShop = new Map<string, Record<string, unknown>>()
  private lastHealthLogAt = new Map<string, number>()
  private monitorByShop = new Map<string, WebContents>()
  private imByShop = new Map<string, WebContents>()
  /** 发货串行，避免多店同时打 IM */
  private shipChain: Promise<void> = Promise.resolve()
  /** 登录成功后由主进程按店拉起隐藏客服窗 */
  private ensureImSession: ((shopId: string) => Promise<boolean>) | null = null
  /** 发货前确保 BrowserView 离屏挂载（detach 会导致 XhsRim 不加载） */
  private ensureBrowserViewActive: (() => Promise<boolean>) | null = null
  /** 轮询退避计数（失败时指数退避） */
  private pollBackoff = 0
  /** 轮询序号：每隔几次做一次「虚拟已发货补拉」 */
  private pollTick = 0
  /** 默认轮询间隔：15 秒（虚拟单窗口短，官方可能几分钟内改成已发货） */
  private static readonly DEFAULT_POLL_INTERVAL = 15_000
  /** 退避上限：60 秒 */
  private static readonly MAX_POLL_BACKOFF = 60_000
  private goodsSyncWindow: BrowserWindow | null = null
  /** 按店隐藏的 ark 订单查询窗（轮询用，与客服 IM 窗分离） */
  private orderPollByShop = new Map<string, BrowserWindow>()
  private orderPollReadyAt = new Map<string, number>()
  private imWsCdp: ImWsCdpService
  private agisoIm: AgisoImManager | null = null

  constructor(storage: StorageService, logger: LoggerService, mock: MockService) {
    this.storage = storage
    this.logger = logger
    this.mock = mock
    this.imWsCdp = new ImWsCdpService(logger)
  }

  setAgisoImManager(m: AgisoImManager) {
    this.agisoIm = m
  }

  setInjectService(inject: InjectService) {
    this.injectService = inject
  }

  setPsyCloud(svc: PsyCloudService) {
    this.psyCloud = svc
  }

  setEnsureImSession(fn: (shopId: string) => Promise<boolean>) {
    this.ensureImSession = fn
  }

  setEnsureBrowserViewActive(fn: () => Promise<boolean>) {
    this.ensureBrowserViewActive = fn
  }

  /**
   * 启动保活未完成前禁止轮询：首轮 poll 会 ensureImSession→二次 loadURL，
   * 与 ready-to-show 的 dashboard 导航撞车，曾导致 Electron ACCESS_VIOLATION 闪退。
   */
  private pollingEnabled = true

  setPollingEnabled(enabled: boolean) {
    this.pollingEnabled = !!enabled
    if (!this.pollingEnabled) this.stopPolling()
  }

  isPollingEnabled(): boolean {
    return this.pollingEnabled
  }

  bindWebContents(wc: WebContents, shopId?: string, opts?: { startPolling?: boolean }) {
    const sid = shopId || currentShopId()
    this.monitorWebContents = wc
    this.monitorByShop.set(sid, wc)
    this.logger.info(`[AutoShip] 已绑定监测 WebContents（dashboard）shop=${sid}`)
    if (opts?.startPolling === false) return
    if (!this.pollingEnabled) return
    this.startPolling()
  }

  /** 绑定隐藏 chat 窗（XhsRim 挂载在 /cstools/chat，与 dashboard 分离存储） */
  bindImWebContents(wc: WebContents, shopId?: string) {
    const sid = shopId || currentShopId()
    this.imWebContents = wc
    this.imByShop.set(sid, wc)
    this.logger.info(`[AutoShip] 已绑定 IM chat WebContents shop=${sid}`)
  }

  unbindImWebContents(shopId: string) {
    const sid = String(shopId || '').trim()
    if (!sid) return
    const cur = this.imByShop.get(sid)
    this.imByShop.delete(sid)
    if (this.imWebContents === cur) this.imWebContents = null
    this.logger.info(`[AutoShip] 已解绑 IM WebContents shop=${sid}`)
  }

  /** @deprecated 使用 bindWebContents */
  bindWindow(window: { webContents: WebContents }) {
    this.bindWebContents(window.webContents)
  }

  private getShipWc(shopId?: string): WebContents | null {
    return this.getImWcForShip(shopId)
  }

  private collectImWcCandidates(shopId?: string): WebContents[] {
    const sid = shopId || currentShopId()
    const candidates: WebContents[] = []
    const dashWc =
      this.monitorByShop.get(sid) || (sid === currentShopId() ? this.monitorWebContents : null)
    if (dashWc && !dashWc.isDestroyed()) candidates.push(dashWc)
    const chatWc = this.imByShop.get(sid) || (sid === currentShopId() ? this.imWebContents : null)
    if (chatWc && !chatWc.isDestroyed() && !candidates.includes(chatWc)) candidates.push(chatWc)
    for (const wc of this.imByShop.values()) {
      if (wc && !wc.isDestroyed() && !candidates.includes(wc)) candidates.push(wc)
    }
    for (const wc of this.monitorByShop.values()) {
      if (wc && !wc.isDestroyed() && !candidates.includes(wc)) candidates.push(wc)
    }
    return candidates
  }

  /** 发码 IM WebContents：优先 ws/rim 已就绪的页，其次 dashboard，再 chat */
  private getImWcForShip(shopId?: string): WebContents | null {
    const candidates = this.collectImWcCandidates(shopId)
    const onWalle = (wc: WebContents) => {
      const url = wc.getURL() || ''
      return url.includes('walle.xiaohongshu.com') && !url.includes('/login')
    }
    // ★ 优先 dashboard 页：只有 /cstools/seller/dashboard 才渲染 .farmer-chat-app（含聊天组件）；
    // chat 页不渲染 .farmer-chat-app（CDP 探测确认），故 dashboard 优先。
    for (const wc of candidates) {
      if (onWalle(wc) && (wc.getURL() || '').includes('/cstools/seller/dashboard')) return wc
    }
    for (const wc of candidates) {
      if (onWalle(wc) && (wc.getURL() || '').includes('/cstools/chat')) return wc
    }
    for (const wc of candidates) {
      if (onWalle(wc)) return wc
    }
    return null
  }

  /** 按 ws/rim/imLogin 打分选最佳发码页（避免 dashboard 无 WS 时误选） */
  private async pickImWcForShip(shopId?: string): Promise<WebContents | null> {
    const candidates = this.collectImWcCandidates(shopId)
    let best: WebContents | null = null
    let bestScore = -1
    for (const wc of candidates) {
      const url = wc.getURL() || ''
      if (!url.includes('walle.xiaohongshu.com') || url.includes('/login')) continue
      if (this.injectService) {
        await this.injectService.injectScriptAsync(wc, 'im-send').catch(() => false)
      }
      const st = (await wc
        .executeJavaScript(
          `(async function(){
            try {
              if (window.__xhsAssistant?.im?.ensureZeldaWs) {
                await window.__xhsAssistant.im.ensureZeldaWs(4000).catch(function(){});
              }
              var im = window.__xhsAssistant && window.__xhsAssistant.im;
              var wsReady = !!(im && im.isWsReady && im.isWsReady());
              var rim = !!(im && im.getActiveRim && im.getActiveRim() && typeof im.getActiveRim().sendTextMsg === 'function');
              var info = im && im.readImLoginInfo ? im.readImLoginInfo() : null;
              var diag = im && im.getWsDiag ? im.getWsDiag() : {};
              return {
                wsReady: wsReady,
                rim: rim,
                imLogin: !!(info && info.csProviderId),
                onDashboard: /\\/cstools\\/seller\\/dashboard/.test(location.href),
                onChat: /\\/cstools\\/chat/.test(location.href),
                wsDiag: diag
              };
            } catch(e) { return { wsReady: false, rim: false, imLogin: false, onDashboard: false, onChat: false, err: String(e) }; }
          })()`
        )
        .catch(() => ({
          wsReady: false,
          rim: false,
          imLogin: false,
          onDashboard: false,
          onChat: false
        }))) as {
        wsReady?: boolean
        rim?: boolean
        imLogin?: boolean
        onDashboard?: boolean
        onChat?: boolean
      }
      let score = 0
      if (st.wsReady) score += 8
      if (st.rim) score += 6
      if (st.imLogin) score += 4
      if (st.onDashboard) score += 1
      if (st.onChat) score += 2
      if (score > bestScore) {
        bestScore = score
        best = wc
      }
    }
    return best || this.getImWcForShip(shopId)
  }

  /** @deprecated 使用 getImWcForShip */
  private getImOnlyWc(shopId?: string): WebContents | null {
    const sid = shopId || currentShopId()
    const pickChat = (wc: WebContents | null | undefined) => {
      if (!wc || wc.isDestroyed()) return null
      const url = wc.getURL() || ''
      if (url.includes('/cstools/chat') && !url.includes('/login')) return wc
      return null
    }
    const direct = pickChat(this.imByShop.get(sid) || (sid === currentShopId() ? this.imWebContents : null))
    if (direct) return direct
    for (const wc of this.imByShop.values()) {
      const hit = pickChat(wc)
      if (hit) return hit
    }
    if (this.imWebContents) {
      const hit = pickChat(this.imWebContents)
      if (hit) return hit
    }
    return null
  }

  getImHealth(shopId?: string): Record<string, unknown> | null {
    const sid = shopId || currentShopId()
    return this.imHealthByShop.get(sid) || null
  }

  /** 主动刷新 IM 健康（供本地 API / 自动化测试） */
  async refreshImHealth(shopId?: string): Promise<Record<string, unknown> | null> {
    const sid = shopId || currentShopId()
    const wc = (await this.pickImWcForShip(sid)) || this.getImWcForShip(sid)
    if (!wc || wc.isDestroyed()) return null
    return this.runImHealthCheck(sid, wc)
  }

  /** csBridge / XhsRim 诊断（chat 页注入 csbridge-diag.js 后执行） */
  async runCsBridgeDiag(shopId?: string): Promise<Record<string, unknown> | null> {
    const sid = shopId || currentShopId()
    const wc = (await this.pickImWcForShip(sid)) || this.getImWcForShip(sid)
    if (!wc || wc.isDestroyed()) return null
    if (this.injectService) {
      await this.injectService.injectScriptAsync(wc, 'im-send').catch(() => false)
      await this.injectService.injectScriptAsync(wc, 'csbridge-diag').catch(() => false)
    }
    return wc
      .executeJavaScript(
        `(function(){
          if (window.__xhsAssistant?.diag?.runCsBridgeDiag) {
            return window.__xhsAssistant.diag.runCsBridgeDiag();
          }
          return {
            ok: false,
            error: 'csbridge-diag not loaded',
            url: location.href,
            hasAssistant: !!window.__xhsAssistant,
            hasIm: !!(window.__xhsAssistant && window.__xhsAssistant.im),
            diagReady: !!window.__xhsCsBridgeDiagReady
          };
        })()`
      )
      .catch((e) => ({ ok: false, error: String(e) })) as Promise<Record<string, unknown>>
  }

  /** Vue2/Vue3 深探 getRim（排查 rim:false） */
  async runDeepProbeRim(shopId?: string): Promise<Record<string, unknown> | null> {
    const sid = shopId || currentShopId()
    const wc = (await this.pickImWcForShip(sid)) || this.getImWcForShip(sid)
    if (!wc || wc.isDestroyed()) return null
    if (this.injectService) {
      await this.injectService.injectScriptAsync(wc, 'im-send').catch(() => false)
    }
    return wc
      .executeJavaScript(
        `(async function(){
          if (window.__xhsAssistant?.im?.deepProbeRim) {
            return window.__xhsAssistant.im.deepProbeRim();
          }
          return { ok: false, error: 'deepProbeRim not loaded', url: location.href };
        })()`
      )
      .catch((e) => ({ ok: false, error: String(e) })) as Promise<Record<string, unknown>>
  }

  /** get_csa_info + XhsRim + ImLoginInfo 健康检查（rim 未就绪时自动切 chat） */
  private async runImHealthCheck(shopId: string, wc: WebContents): Promise<Record<string, unknown>> {
    if (this.injectService) {
      await this.injectService.injectScriptAsync(wc, 'im-send').catch(() => false)
    }
    let health = (await wc
      .executeJavaScript(
        `(async function(){
          if (!window.__xhsAssistant?.im?.checkImHealth) return { ok: false, error: 'no bridge' };
          return await window.__xhsAssistant.im.checkImHealth();
        })()`
      )
      .catch((e) => ({ ok: false, error: String(e) }))) as Record<string, unknown>
    if (!health.rim) {
      const rimOk = await this.ensureXhsRimLoaded(wc, shopId, 12000)
      if (rimOk && this.injectService) {
        await this.injectService.injectScriptAsync(wc, 'im-send').catch(() => false)
      }
      health = (await wc
        .executeJavaScript(
          `(async function(){
            if (!window.__xhsAssistant?.im?.checkImHealth) return { ok: false, error: 'no bridge' };
            return await window.__xhsAssistant.im.checkImHealth();
          })()`
        )
        .catch((e) => ({ ok: false, error: String(e) }))) as Record<string, unknown>
    }
    this.imHealthByShop.set(shopId, health)
    const now = Date.now()
    const last = this.lastHealthLogAt.get(shopId) || 0
    const csa = health.csa as { ok?: boolean } | undefined
    if (now - last > 60_000 || !health.ok) {
      this.lastHealthLogAt.set(shopId, now)
      this.logger.info(
        `[Health] shop=${shopId} csa=${csa?.ok ? 'ok' : 'fail'} rim=${health.rim ? 'ok' : 'fail'} ws=${health.wsReady ? 'ok' : 'fail'} imLogin=${health.imLogin ? 'ok' : 'fail'} token=${health.token ? 'ok' : 'fail'}`
      )
    }
    return health
  }

  /**
   * 等待 dashboard / chat 页 XhsRim 就绪；禁止对 dashboard loadURL chat。
   */
  private async ensureXhsRimLoaded(
    wc: WebContents,
    shopId: string,
    waitMs = 45000
  ): Promise<boolean> {
    if (this.ensureImSession) {
      await this.ensureImSession(shopId).catch(() => false)
    }
    let target = this.getImOnlyWc(shopId) || this.getImWcForShip(shopId) || wc
    if (!target || target.isDestroyed()) return false

    if (this.injectService) {
      await this.injectService.injectScriptAsync(target, 'im-send').catch(() => false)
    }

    const deadline = Date.now() + waitMs
    let st: {
      rim: boolean
      fullRim: boolean
      csProviderId: boolean
      url: string
      onDashboard: boolean
      farmerChatApp: boolean
      fcVue: boolean
      appVue: boolean
    } = {
      rim: false,
      fullRim: false,
      csProviderId: false,
      url: '',
      onDashboard: false,
      farmerChatApp: false,
      fcVue: false,
      appVue: false
    }
    while (Date.now() < deadline) {
      st = (await target
        .executeJavaScript(
          `(function(){
            try {
              var rim = window.__xhsAssistant && window.__xhsAssistant.im && window.__xhsAssistant.im.getActiveRim
                ? window.__xhsAssistant.im.getActiveRim()
                : window.XhsRim;
              var app = document.querySelector('#app');
              var info = app && app.__vue_app__ && app.__vue_app__._context && app.__vue_app__._context.provides && app.__vue_app__._context.provides.store && app.__vue_app__._context.provides.store.state && app.__vue_app__._context.provides.store.state.imStore && app.__vue_app__._context.provides.store.state.imStore.xUserInfo;
              var hasSend = !!(rim && typeof rim.sendTextMsg === 'function');
              var hasGetChat = !!(rim && rim.rimSdk && typeof rim.rimSdk.getChatInfo === 'function');
              var fc = document.querySelector('.farmer-chat-app');
              return {
                rim: hasSend,
                fullRim: hasSend && hasGetChat,
                csProviderId: !!(info && info.csProviderId),
                url: location.href.slice(0, 100),
                onDashboard: /\\/cstools\\/seller\\/dashboard/.test(location.href),
                farmerChatApp: !!fc,
                fcVue: !!(fc && fc.__vue__),
                appVue: !!(document.querySelector('#app') && document.querySelector('#app').__vue_app__)
              };
            } catch(e){ return { rim: false, fullRim: false, csProviderId: false, url: '', onDashboard: false, farmerChatApp: false, fcVue: false, appVue: false }; }
          })()`
        )
        .catch(() => ({
          rim: false,
          fullRim: false,
          csProviderId: false,
          url: '',
          onDashboard: false,
          farmerChatApp: false,
          fcVue: false,
          appVue: false
        }))) as {
        rim: boolean
        fullRim: boolean
        csProviderId: boolean
        url: string
        onDashboard: boolean
        farmerChatApp: boolean
        fcVue: boolean
        appVue: boolean
      }
      if (st.rim && st.csProviderId) {
        this.logger.info(
          `[AutoShip] XhsRim 已就绪 shop=${shopId} full=${st.fullRim} dashboard=${st.onDashboard} url=${st.url}`
        )
        return true
      }
      await this.sleep(500)
    }
    this.logger.warn(
      `[AutoShip] XhsRim 等待超时 shop=${shopId} url=${(target.getURL() || '').slice(0, 80)} farmerChatApp=${st.farmerChatApp} fcVue=${st.fcVue} appVue=${st.appVue} csProviderId=${st.csProviderId}`
    )
    return false
  }

  /**
   * 订单轮询优先用隐藏 ark 订单页（HAR 同源 + _webmsxyw），失败再回落客服 IM 页。
   * 发货仍走 getShipWc / IM。
   */
  private async ensureOrderPollWc(shopId: string): Promise<WebContents | null> {
    const sid = String(shopId || currentShopId()).trim() || currentShopId()
    try {
      let win = this.orderPollByShop.get(sid)
      if (!win || win.isDestroyed()) {
        win = new BrowserWindow({
          show: false,
          width: 1100,
          height: 720,
          title: '订单轮询（后台）',
          autoHideMenuBar: true,
          skipTaskbar: true,
          webPreferences: {
            partition: partitionForShop(sid),
            nodeIntegration: false,
            contextIsolation: true,
            webSecurity: false
          }
        })
        win.on('show', () => {
          try {
            win!.setSkipTaskbar(true)
            win!.hide()
          } catch {
            /* ignore */
          }
        })
        this.orderPollByShop.set(sid, win)
        win.on('closed', () => {
          if (this.orderPollByShop.get(sid) === win) this.orderPollByShop.delete(sid)
          this.orderPollReadyAt.delete(sid)
        })
        this.logger.info(`[AutoShip] 创建隐藏 ark 订单轮询窗 shop=${sid}`)
      }

      const wc = win.webContents
      const url = wc.getURL() || ''
      const needLoad =
        !url ||
        url === 'about:blank' ||
        isArkLoginUrl(url) ||
        !/ark\.xiaohongshu\.com\/app-order/i.test(url)
      const lastReady = this.orderPollReadyAt.get(sid) || 0
      if (needLoad || Date.now() - lastReady > 30 * 60 * 1000) {
        await withTimeout(wc.loadURL(ARK_ORDER_QUERY_URL) as any, 25000, null)
        await new Promise((r) => setTimeout(r, 1200))
      }

      const after = wc.getURL() || ''
      if (isArkLoginUrl(after) || !isArkAuthedUrl(after)) {
        this.logger.warn(
          `[AutoShip] ark 订单页未登录，回落客服页轮询 shop=${sid} url=${after.slice(0, 90)}`
        )
        return this.getShipWc(sid)
      }

      await this.seedArkAccessToken(wc, sid)
      if (this.injectService) {
        await this.injectService.injectScriptAsync(wc, 'im-send').catch(() => false)
      }
      this.orderPollReadyAt.set(sid, Date.now())
      return wc
    } catch (e) {
      this.logger.warn(`[AutoShip] ensureOrderPollWc 失败 shop=${sid}: ${e}`)
      return this.getShipWc(sid)
    }
  }

  startPolling(intervalMs?: number) {
    if (!this.pollingEnabled) {
      this.logger.info('[AutoShip] 轮询已挂起（启动保活/未登录），跳过 startPolling')
      return
    }
    this.stopPolling()
    // 默认 15 秒；配置值若 <5 秒则强制下限保护（避免内部接口风控）
    const base = intervalMs && intervalMs > 0 ? intervalMs : AutoShipService.DEFAULT_POLL_INTERVAL
    const safeBase = Math.max(base, 5000)

    const schedule = () => {
      if (!this.pollingEnabled) return
      if (this.monitorInterval) clearInterval(this.monitorInterval)
      // 抖动 ±0~5 秒，避免多实例同时请求
      const jitter = Math.floor(Math.random() * 5000)
      const delay = safeBase + jitter + this.pollBackoff
      this.monitorInterval = setTimeout(async () => {
        try {
          await this.pollOrders()
        } catch (err) {
          this.logger.error('[AutoShip] 轮询订单失败:', err)
        }
        schedule()
      }, delay)
    }
    schedule()
    this.logger.info(`[AutoShip] 启动轮询监测，基础间隔: ${safeBase}ms（含抖动与退避）`)
  }

  stopPolling() {
    if (this.monitorInterval) {
      clearTimeout(this.monitorInterval)
      this.monitorInterval = null
      this.logger.info('[AutoShip] 停止轮询监测')
    }
  }

  /**
   * 主动轮询待发货订单（fulfillment API，对标阿奇锁 getOrderDetailGoodsId）
   */
  private async pollOrders(): Promise<void> {
    if (!this.pollingEnabled) return
    const shopIds = new Set<string>([currentShopId(), ...this.monitorByShop.keys(), ...this.imByShop.keys()])
    for (const s of this.storage.listShops()) {
      if (s.id) shopIds.add(s.id)
    }
    // 有真实店铺时不要再用 default 重复拉同一批订单（会导致假店先占台账）
    const real = [...shopIds].filter((id) => id && id !== 'default')
    const pollList = real.length > 0 ? real : [...shopIds]
    const seenOrderIds = new Set<string>()
    for (const shopId of pollList) {
      const mon = this.monitorByShop.get(shopId) || (shopId === currentShopId() ? this.monitorWebContents : null)
      const monUrl = mon && !mon.isDestroyed() ? mon.getURL() || '' : ''
      // 登录页 / 加载中勿 ensureImSession，避免二次 loadURL 打断保活导航
      const pageBusy =
        !monUrl ||
        monUrl === 'about:blank' ||
        monUrl.includes('/login') ||
        (!!mon && !mon.isDestroyed() && mon.isLoading())
      const hasSession =
        !!this.storage.getShopCookies(shopId) ||
        this.imByShop.has(shopId) ||
        this.monitorByShop.has(shopId)
      if (hasSession && this.ensureImSession && !pageBusy) {
        await this.ensureImSession(shopId).catch(() => false)
      }
      await this.pollOrdersForShop(shopId, seenOrderIds)
    }
  }

  private async pollOrdersForShop(shopId: string, seenOrderIds?: Set<string>): Promise<void> {
    const wc = await this.ensureOrderPollWc(shopId)
    if (!wc) {
      this.logger.warn(`[AutoShip] 轮询跳过：无 WebContents shop=${shopId}`)
      return
    }
    const url = wc.getURL()
    if (!url.includes('walle.xiaohongshu.com') && !url.includes('ark.xiaohongshu.com')) {
      this.logger.warn(`[AutoShip] 轮询跳过：页面不在千帆域 shop=${shopId} url=${url.slice(0, 80)}`)
      return
    }

    try {
      // 页面可能被导航冲掉脚本，每次轮询确保注入
      if (this.injectService) {
        await this.injectService.injectScriptAsync(wc, 'im-send').catch(() => false)
      }

      const shipWc = this.getShipWc(shopId)
      if (shipWc && !shipWc.isDestroyed()) {
        await this.runImHealthCheck(shopId, shipWc)
      }

      const ready = await wc
        .executeJavaScript(
          `!!(window.__xhsAssistant && window.__xhsAssistant.im && window.__xhsAssistant.im.fetchPendingOrders)`
        )
        .catch(() => false)
      if (!ready) {
        this.logger.warn(`[AutoShip] 轮询跳过：IMSend 未就绪 shop=${shopId}`)
        return
      }

      this.pollTick += 1
      // 全量订单：status:[]，不按千帆状态过滤；是否发卡只看本地台账
      const raw = await wc.executeJavaScript(`
        window.__xhsAssistant.im.fetchPendingOrders({ lookbackDays: 7 })
          .catch(function(e){ return { __error: String(e&&e.message||e) }; })
      `)

      if (raw && raw.__error) {
        this.logger.warn(`[AutoShip] fetchPendingOrders shop=${shopId}: ${raw.__error}`)
        this.pollBackoff = Math.min((this.pollBackoff || 3000) * 2, AutoShipService.MAX_POLL_BACKOFF)
        return
      }

      const orders = Array.isArray(raw) ? raw : Array.isArray(raw?.orders) ? raw.orders : null
      if (!orders) {
        this.logger.warn(`[AutoShip] fetchPendingOrders 返回异常 shop=${shopId} type=${typeof raw}`)
        return
      }

      this.pollBackoff = 0
      if (orders.length === 0) {
        if (this.pollTick % 4 === 1) {
          this.logger.info(`[AutoShip] 轮询空列表 shop=${shopId} url=${url.slice(0, 60)}`)
        }
        return
      }

      this.logger.info(
        `[AutoShip] 轮询命中 ${orders.length} 单(全量) shop=${shopId} host=${orders[0]?.host || '-'}`
      )
      for (const order of orders) {
        const oid = String(order.order_id || '')
        if (oid && seenOrderIds) {
          if (seenOrderIds.has(oid)) continue
          seenOrderIds.add(oid)
        }
        await this.handleNewOrder({ ...order, shop_id: shopId, source: order.source || 'poll' })
      }
      this.cleanupProcessed()
    } catch (err) {
      this.logger.warn(`[AutoShip] 轮询异常 shop=${shopId}: ${err}`)
    }
  }

  async handleNewOrder(order: {
    order_id: string
    product_id?: string
    buyer_info?: unknown
    status?: string
    status_code?: number | null
    order_time?: string
    is_virtual?: boolean
    source?: string
    shop_id?: string
    shopId?: string
  }): Promise<void> {
    if (!order || !order.order_id) return

    let shopId = String(order.shop_id || order.shopId || currentShopId())
    let productId = order.product_id || ''
    if (!productId) {
      productId = (await this.resolveProductId(order.order_id, shopId)) || ''
    }
    order.product_id = productId

    // 绑定表上的店铺优先（避免 default 假店占坑）
    const bindingEarly = productId ? this.storage.getProductBinding(productId) : null
    if (bindingEarly?.shop_id) {
      shopId = String(bindingEarly.shop_id)
    }
    order.shop_id = shopId

    // 1) 全量入台账（无视千帆状态）
    this.storage.upsertOrderLedger({
      orderId: order.order_id,
      shopId,
      productId,
      platformStatus: order.status || '',
      platformStatusCode: order.status_code ?? null,
      orderTime: order.order_time || '',
      isVirtual: !!order.is_virtual
    })

    this.logger.info(
      `[AutoShip] 台账订单: shop=${shopId} orderId=${order.order_id}, productId=${productId || 'N/A'}, platform=${order.status || '-'}, source=${order.source || '-'}`
    )

    if (this.psyCloud?.getToken()) {
      void this.psyCloud.syncOrders([{ order_id: order.order_id, product_id: productId }])
    }

    // 2) 只跟本地「是否已真实发码」比对
    if (this.storage.hasShippedCode(order.order_id)) {
      this.logger.info(`[AutoShip] 台账已发码，跳过: ${order.order_id}`)
      return
    }
    if (this.storage.existsOrderDelivery(order.order_id)) {
      // Mock 假成功 / 卡住的 sending·fail：清占位后允许重试；成功则上面已 return
      const rows = this.storage.getOrderDeliveries(order.order_id) as Array<{
        send_status?: string
        updated_at?: string
      }>
      const onlyMock =
        rows.length > 0 && rows.every((r) => String(r.send_status || '') === 'mock_success')
      const stuck =
        rows.length > 0 &&
        rows.every((r) => {
          const st = String(r.send_status || '')
          return st === 'fail' || st === 'pending' || st === 'sending'
        })
      if (onlyMock || stuck) {
        this.storage.clearOrderDelivery(order.order_id)
        this.logger.warn(
          `[AutoShip] 清除未成功发码占位，准备重试: ${order.order_id} mock=${onlyMock} stuck=${stuck}`
        )
      } else {
        return
      }
    }
    if (this.processedOrders.has(`${shopId}:${order.order_id}`)) {
      return
    }

    if (!productId) {
      this.logger.warn(`[AutoShip] 订单缺 product_id，仅入台账: ${order.order_id}`)
      return
    }

    // 3) 绑定时间门禁：绑定之前的订单只入台账，不补发（防历史单重复发码）
    if (bindingEarly?.created_at && order.order_time) {
      const orderTs = this.parseTimeToTs(order.order_time, 'cn')
      const bindingTs = this.parseTimeToTs(bindingEarly.created_at, 'utc')
      if (orderTs !== null && bindingTs !== null && orderTs < bindingTs) {
        this.logger.info(
          `[AutoShip] 订单早于绑定时间，仅入台账不发码: order=${order.order_id}, orderTime=${order.order_time}, bindingTime=${bindingEarly.created_at}`
        )
        return
      }
    }
    if (!bindingEarly) {
      this.logger.info(`[AutoShip] 未绑定商品，仅入台账: productId=${productId} order=${order.order_id}`)
      return
    }

    const run = this.shipChain.then(() => this.shipOneOrder(shopId, order))
    this.shipChain = run.then(
      () => undefined,
      () => undefined
    )
    await run
  }

  private async shipOneOrder(shopId: string, order: any): Promise<void> {
    this.isShipping = true
    try {
      const success = await this.processShipment(shopId, order)
      if (success) {
        this.processedOrders.add(`${shopId}:${order.order_id}`)
        this.logger.info(`[AutoShip] 订单发货成功: shop=${shopId} ${order.order_id}`)
      } else {
        this.logger.warn(`[AutoShip] 订单发货失败: shop=${shopId} ${order.order_id}`)
      }
    } catch (err) {
      this.logger.error(`[AutoShip] 订单发货异常: shop=${shopId} ${order.order_id}`, err)
    } finally {
      this.isShipping = false
    }
  }

  private async resolveProductId(orderId: string, shopId?: string): Promise<string | null> {
    const wc = this.getShipWc(shopId)
    if (!wc) return null
    try {
      const orders = await wc.executeJavaScript(`
        window.__xhsAssistant && window.__xhsAssistant.im
          ? window.__xhsAssistant.im.fetchPendingOrders()
          : Promise.resolve([])
      `)
      if (!Array.isArray(orders)) return null
      const hit = orders.find((o: { order_id?: string }) => o.order_id === orderId)
      return hit?.product_id || null
    } catch {
      return null
    }
  }

  private async processShipment(shopId: string, order: any): Promise<boolean> {
    // 商家级匹配：只认 product_id；IM 仍用订单所属店
    const binding = this.storage.getProductBinding(order.product_id)
    if (!binding) {
      // 未绑定只入台账，不刷 ship_log（全量轮询会反复扫到）
      this.logger.info(
        `[AutoShip] 未绑定商品，仅入台账: productId=${order.product_id} order=${order.order_id}`
      )
      return false
    }

    // ===== 绑定时间过滤：只处理「绑定商品之后」下单的订单 =====
    if (order.order_time && binding.created_at) {
      const orderTs = this.parseTimeToTs(order.order_time, 'cn')
      const bindingTs = this.parseTimeToTs(binding.created_at, 'utc')
      if (orderTs !== null && bindingTs !== null && orderTs < bindingTs) {
        this.logger.info(
          `[AutoShip] 订单早于绑定时间，跳过（只处理绑定后订单）: order=${order.order_id}, orderTime=${order.order_time}, bindingTime=${binding.created_at}`
        )
        return false
      }
    }

    // 构建消息列表（6 种类型 + 多轮拆分 + mixed 多段）
    const messages = buildMessages(binding)
    if (messages === null) {
      // manual 类型
      this.logger.info(`[AutoShip] 手动发货订单，等待处理: ${order.order_id}`)
      this.storage.addShipLog({
        shopId,
        orderId: order.order_id,
        status: 'pending_manual',
        errorMsg: '需手动发货'
      })
      return true
    }
    if (messages.length === 0) {
      this.logger.error(`[AutoShip] 发货内容为空: bindingId=${binding.id}`)
      return false
    }

    const msgTotal = messages.length
    const buyerUid = (order.buyer_info as any)?.user_id || ''
    const buyerName = (order.buyer_info as any)?.nickname || ''

    // 预检查：若任一消息需要卡密但卡密池为空，提前失败（避免半途才发现）
    let cardForOrder: string | null = null
    let cardLocked = false
    let cloudAllocatedUrl: string | null = null

    // 链接卡密：只问心象测（一户一池，按订单号幂等）。本地卡池不扣第二份。
    const isLinkCard = String(binding.deliver_type || '') === 'link_card'
    if (isLinkCard) {
      if (!this.psyCloud?.getToken()) {
        this.logger.error(`[AutoShip] 心象测未登录，无法分配链接: ${order.order_id}`)
        this.storage.addShipLog({
          shopId,
          orderId: order.order_id,
          status: 'cloud_allocate_fail',
          errorMsg: '未配置心象测 Token，链接卡密必须走云端分配'
        })
        return false
      }
      const alloc = await this.psyCloud.allocateForOrder(order.order_id, order.product_id)
      if (!alloc.success || !alloc.url) {
        this.logger.error(`[AutoShip] 云端分配失败: ${order.order_id} ${alloc.message || ''}`)
        this.storage.addShipLog({
          shopId,
          orderId: order.order_id,
          status: 'cloud_allocate_fail',
          errorMsg: alloc.message || '云端分配失败'
        })
        return false
      }
      cloudAllocatedUrl = alloc.url
      cardForOrder = alloc.url
      this.logger.info(
        `[AutoShip] 云端分配 URL shop=${shopId} order=${order.order_id} already=${!!alloc.already}`
      )
    }

    // 逐条发送（状态机 + 消息级追踪，对标阿奇锁 SetReplySending/Success/Fail）
    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i]
      const msgGuid = randomUUID()

      // 落库占位（幂等）：订单首次处理时插入；已有记录则说明是断点续发
      this.storage.claimOrderDelivery({
        shopId,
        orderId: order.order_id,
        productId: order.product_id,
        bindingId: binding.id,
        msgGuid,
        msgIndex: i + 1,
        msgTotal
      })

      // 普通卡密才锁本地池；link_card 已用云端 URL
      const needCard = needsCard(msg.rawContent)
      if (needCard && !cardForOrder) {
        if (isLinkCard) {
          this.storage.updateDeliveryStatus(msgGuid, 'fail', { errorMsg: '心象测未返回链接' })
          this.storage.addShipLog({
            shopId,
            orderId: order.order_id,
            status: 'cloud_allocate_fail',
            errorMsg: '心象测未返回链接'
          })
          return false
        }
        const card = this.storage.lockCard(binding.id, order.order_id, !!binding.random_mode)
        if (!card) {
          this.logger.error(`[AutoShip] 卡密池已空: bindingId=${binding.id}`)
          this.storage.updateDeliveryStatus(msgGuid, 'fail', { errorMsg: '卡密池已空' })
          this.storage.addShipLog({ shopId, orderId: order.order_id, status: 'out_of_stock', errorMsg: '卡密池已空' })
          return false
        }
        cardForOrder = card
        cardLocked = true
      } else if (needCard && cloudAllocatedUrl) {
        cardForOrder = cloudAllocatedUrl
      }

      const shopCfg = this.storage.getShopConfig(shopId)
      const ctx: TemplateContext = {
        orderId: order.order_id,
        buyerName,
        productName: binding.product_name || '',
        card: cardForOrder ?? undefined,
        shopName: shopCfg?.shop_name || shopCfg?.config?.shopName || '',
        uidLength: binding.uid_length ?? 10
      }
      const finalContent = renderTemplate(msg.rawContent, ctx)

      // 更新状态为 sending
      this.storage.updateDeliveryStatus(msgGuid, 'sending', {
        buyerUid,
        cardContent: cardForOrder ?? undefined
      })

      // Mock 模式：直接成功（记 mock_success，不算真实发码）
      let shipResult: { success: boolean; trackingNumber?: string; buyerId?: string; error?: string }
      if (this.mock.isEnabled()) {
        this.logger.warn(
          `[AutoShip][Mock] 模拟发货[${i + 1}/${msgTotal}]（未真实发 IM）: ${finalContent.substring(0, 20)}...`
        )
        shipResult = { success: true, trackingNumber: finalContent.substring(0, 50) }
      } else {
        shipResult = await this.executeRealShip(shopId, order.order_id, finalContent, msg.type)
      }

      if (shipResult.success) {
        if (cardLocked) this.storage.confirmCard(order.order_id)
        if (isLinkCard && cloudAllocatedUrl) {
          this.storage.markCardUrlUsed(binding.id, cloudAllocatedUrl, order.order_id)
        }
        const realBuyerUid = shipResult.buyerId || buyerUid || ''
        const sendStatus = this.mock.isEnabled() ? 'mock_success' : 'success'
        this.storage.updateDeliveryStatus(msgGuid, sendStatus, {
          buyerUid: realBuyerUid || undefined,
          cardContent: cardForOrder ?? undefined
        })
        this.storage.addShipLog({
          shopId,
          orderId: order.order_id,
          trackingNumber: shipResult.trackingNumber || finalContent.substring(0, 50),
          status: sendStatus
        })
        this.logger.info(`[AutoShip] 消息发送成功 [${i + 1}/${msgTotal}]: ${order.order_id} status=${sendStatus}`)
        if (sendStatus === 'success' && i === msgTotal - 1) {
          notifyDesktop('发货成功', `订单 ${order.order_id}`)
        }
      } else {
        if (cardLocked) {
          this.storage.rollbackCard(order.order_id)
          cardLocked = false
        }
        this.storage.updateDeliveryStatus(msgGuid, 'fail', { errorMsg: shipResult.error || 'IM 发货失败' })
        this.storage.addShipLog({
          shopId,
          orderId: order.order_id,
          trackingNumber: finalContent.substring(0, 50),
          status: 'failed',
          errorMsg: shipResult.error
        })
        this.logger.error(`[AutoShip] 消息发送失败 [${i + 1}/${msgTotal}]: ${order.order_id}`, shipResult.error)
        notifyDesktop('发货失败', `${order.order_id}：${String(shipResult.error || '').slice(0, 80)}`)
        return false
      }

      // 多轮间隔（最后一条不等待）
      if (i < msgTotal - 1) {
        await this.sleep(binding.send_interval_ms ?? 500)
      }
    }

    return true
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  /**
   * 解析时间字符串为毫秒时间戳。
   * - cn：千帆 paidAt「YYYY-MM-DD HH:mm:ss」按东八区
   * - utc：SQLite datetime('now') 按 UTC
   */
  private parseTimeToTs(timeStr: string, tz: 'cn' | 'utc' | 'auto' = 'auto'): number | null {
    if (!timeStr) return null
    const s = String(timeStr).trim()
    if (!s) return null

    if (/^\d+$/.test(s)) {
      const n = parseInt(s, 10)
      if (n > 1e12) return n
      if (n > 1e9) return n * 1000
      return null
    }

    const m = s.match(
      /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/
    )
    if (m) {
      const y = Number(m[1])
      const mo = Number(m[2]) - 1
      const d = Number(m[3])
      const h = Number(m[4])
      const mi = Number(m[5])
      const se = Number(m[6] || 0)
      const suffix = m[7] || ''
      if (suffix === 'Z' || tz === 'utc') {
        return Date.UTC(y, mo, d, h, mi, se)
      }
      if (suffix) {
        const ts = Date.parse(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${String(se).padStart(2, '0')}${suffix}`)
        return Number.isNaN(ts) ? null : ts
      }
      // 默认按东八区（订单时间 / 未标明时区）
      return Date.UTC(y, mo, d, h, mi, se) - 8 * 60 * 60 * 1000
    }

    const ts = Date.parse(s.replace(' ', 'T'))
    return Number.isNaN(ts) ? null : ts
  }

  /**
   * CDP 直发 impaas WS（页面 hook 未抓到 socket 时兜底）
   */
  private randomTraceId(): string {
    let s = 'cfffd'
    for (let i = 0; i < 27; i++) s += Math.floor(Math.random() * 16).toString(16)
    return s
  }

  private randomSMid(): string {
    let hex = ''
    for (let i = 0; i < 13; i++) hex += Math.floor(Math.random() * 16).toString(16)
    return `${hex}-${Date.now().toString(16).slice(-10)}`
  }

  private randomTextUuid(): string {
    let hex = ''
    for (let i = 0; i < 13; i++) hex += Math.floor(Math.random() * 16).toString(16)
    return `text-${hex}-${Date.now().toString(16).slice(-10)}`
  }

  private randomUuid(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0
      const v = c === 'x' ? r : (r & 0x3) | 0x8
      return v.toString(16)
    })
  }

  private async sendViaMainKefuWs(
    wc: WebContents,
    orderId: string,
    content: string
  ): Promise<{ success: boolean; buyerId?: string; trackingNumber?: string; error?: string }> {
    const wsService = (global as any).wsService as
      | {
          reconnectKefu?: () => void
          ensureKefuOpen?: (ms?: number) => Promise<boolean>
          sendImpaasText?: (content: string, buyerId: string, csId: string) => Promise<{ appCid: string }>
          getStatus?: () => { kefu?: { status?: string } }
        }
      | undefined
    if (!wsService?.sendImpaasText) {
      return { success: false, error: 'WebSocketService 不可用' }
    }
    if (this.injectService) {
      await this.injectService.injectScriptAsync(wc, 'im-send').catch(() => false)
    }
    const prep = (await wc
      .executeJavaScript(
        `(async function(){
          try {
            var im = window.__xhsAssistant && window.__xhsAssistant.im;
            if (!im) return { error: 'IMSend 未注入' };
            var buyerId = await im.getUserByOrderSn(${JSON.stringify(orderId)});
            if (!buyerId) return { error: 'search_customer 未找到买家' };
            var csId = im.getCsProviderId();
            if (!csId) return { error: 'csProviderId 未就绪' };
            return { buyerId: buyerId, csId: csId };
          } catch (e) {
            return { error: String(e && e.message ? e.message : e) };
          }
        })()`
      )
      .catch((e) => ({ error: String(e) }))) as { buyerId?: string; csId?: string; error?: string }
    if (!prep?.buyerId || !prep.csId) {
      return { success: false, error: prep?.error || '主进程 WS 发码前置失败' }
    }
    try {
      wsService.reconnectKefu?.()
      await wsService.sendImpaasText(content, prep.buyerId, prep.csId)
      this.logger.info(
        `[AutoShip] 主进程 zelda WS 发码成功 order=${orderId} buyer=${prep.buyerId}`
      )
      return {
        success: true,
        buyerId: prep.buyerId,
        trackingNumber: content.substring(0, 50)
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      return { success: false, error: `主进程 zelda WS 发码失败: ${msg}` }
    }
  }

  private async sendViaPageImpaasWs(
    wc: WebContents,
    orderId: string,
    content: string
  ): Promise<{ success: boolean; buyerId?: string; trackingNumber?: string; error?: string }> {
    if (this.injectService) {
      await this.injectService.injectScriptAsync(wc, 'im-send').catch(() => false)
    }
    const result = (await wc
      .executeJavaScript(
        `(async function(){
          try {
            var im = window.__xhsAssistant && window.__xhsAssistant.im;
            if (!im) return { success: false, error: 'IMSend 未注入' };
            await im.ensureZeldaWs(18000);
            var buyerId = await im.getUserByOrderSn(${JSON.stringify(orderId)});
            if (!buyerId) return { success: false, error: 'search_customer 未找到买家' };
            var csId = im.getCsProviderId();
            if (!csId) return { success: false, error: 'csProviderId 未就绪' };
            var wsResult = await im.sendTextViaImpaasWs(${JSON.stringify(content)}, buyerId, csId);
            return {
              success: true,
              buyerId: buyerId,
              via: (wsResult && wsResult.via) || 'impaas-ws-page',
              trackingNumber: ${JSON.stringify(String(content).slice(0, 80))}
            };
          } catch (e) {
            return { success: false, error: String(e && e.message ? e.message : e) };
          }
        })()`
      )
      .catch((e) => ({ success: false, error: String(e) }))) as {
      success?: boolean
      buyerId?: string
      trackingNumber?: string
      error?: string
    }
    if (result?.success) {
      this.logger.info(
        `[AutoShip] 页面 impaas-ws 发码成功 order=${orderId} buyer=${result.buyerId || '-'}`
      )
    }
    return {
      success: !!result?.success,
      buyerId: result?.buyerId,
      trackingNumber: result?.trackingNumber,
      error: result?.error
    }
  }

  private async sendViaImpaasCdp(
    wc: WebContents,
    orderId: string,
    content: string
  ): Promise<{ success: boolean; buyerId?: string; trackingNumber?: string; error?: string }> {
    if (this.injectService) {
      await this.injectService.injectScriptAsync(wc, 'im-send').catch(() => false)
    }
    const prep = (await wc
      .executeJavaScript(
        `(async function(){
          try {
            var im = window.__xhsAssistant && window.__xhsAssistant.im;
            if (!im) return { error: 'IMSend 未注入' };
            var buyerId = await im.getUserByOrderSn(${JSON.stringify(orderId)});
            if (!buyerId) return { error: 'search_customer 未找到买家' };
            var csId = im.getCsProviderId();
            if (!csId) return { error: 'csProviderId 未就绪' };
            var appCid = im.buildAppCid(buyerId, csId);
            return { buyerId: buyerId, csId: csId, appCid: appCid };
          } catch(e) {
            return { error: String(e && e.message || e) };
          }
        })()`
      )
      .catch((e) => ({ error: String(e) }))) as {
      buyerId?: string
      appCid?: string
      error?: string
    }
    if (!prep?.buyerId || !prep.appCid) {
      return { success: false, error: prep?.error || 'CDP 发码前置失败' }
    }

    const attached = await this.imWsCdp.attach(wc)
    if (!attached) {
      return { success: false, error: 'CDP 未找到 zelda WebSocket（请保持 dashboard 已登录）' }
    }

    const traceId = this.randomTraceId()
    const seq = this.imWsCdp.getLastSeq() + 1
    const now = Date.now()
    const frame = {
      header: {
        sTime: now,
        seq,
        type: 3,
        bizId: 10,
        contentType: 'json',
        traceId,
        action: '/message/send',
        serviceId: 'impaas.oi',
        oneWay: false,
        sMid: this.randomSMid()
      },
      body: {
        appCid: prep.appCid,
        convType: 1,
        uuid: this.randomTextUuid(),
        receiverAppUids: [`1#2#2#${prep.buyerId}`],
        contentInfo: { contentType: 1, content: String(content) },
        convCreateIsSelfVisible: true,
        convRedPointIsNotSelfClear: true,
        extension: {
          additionInfo: JSON.stringify({ uuid: this.randomUuid(), sendMsgDoubleCheck: false })
        },
        callbackCtx: {}
      }
    }

    try {
      await this.imWsCdp.sendJson(wc, frame)
      this.logger.info(`[AutoShip] CDP impaas-ws 发码成功 order=${orderId} buyer=${prep.buyerId}`)
      return {
        success: true,
        buyerId: prep.buyerId,
        trackingNumber: content.substring(0, 50)
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      return { success: false, error: `CDP impaas-ws 发码失败: ${msg}` }
    }
  }

  /**
   * 调试：直接走 executeRealShip 并返回完整错误
   */
  async debugDeliver(
    orderId: string,
    content: string
  ): Promise<{ result: Record<string, unknown>; health?: Record<string, unknown> | null }> {
    const sid = currentShopId()
    const health = await this.refreshImHealth(sid)
    const result = await this.executeRealShip(sid, orderId, content, 'text')
    return { result, health }
  }

  /**
   * 真实虚拟发货 — 1:1 对标阿奇锁 AldsMsgManager.SendMsg
   * 主进程 AgisoImManager.sendImTextMsg → executeJavaScript(window.sendImTextMsg)
   * preload 内：search_customer → getChatInfo → sendTextMsg
   */
  private async executeRealShip(
    shopId: string,
    orderId: string,
    content: string,
    type: 'text' | 'image' | 'video' | 'note' = 'text'
  ): Promise<{ success: boolean; trackingNumber?: string; buyerId?: string; error?: string }> {
    if (type !== 'text') {
      return { success: false, error: `1:1 Agiso 路径仅支持 text，当前 type=${type}` }
    }
    if (!this.agisoIm) {
      return { success: false, error: 'AgisoImManager 未初始化' }
    }

    if (this.ensureImSession) {
      const ok = await this.ensureImSession(shopId).catch(() => false)
      if (!ok) {
        return { success: false, error: `店铺 ${shopId} 客服会话页未能打开，请确认该店已登录` }
      }
    }

    const maxAttempts = 4
    let lastError = ''
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const probe = await this.agisoIm.probe(shopId).catch(() => ({} as Record<string, unknown>))
      this.logger.info(
        `[AutoShip] Agiso 发码 attempt=${attempt}/${maxAttempts} shop=${shopId} probe=${JSON.stringify(probe).slice(0, 200)}`
      )

      const result = await this.agisoIm.sendImTextMsg(shopId, orderId, content)
      if (result.ok) {
        this.logger.info(`[AutoShip] IM 发货成功(1:1 Agiso): shop=${shopId} order=${orderId}`)
        return {
          success: true,
          trackingNumber: content.substring(0, 50),
          buyerId: ''
        }
      }

      lastError = result.error || 'IM 发货失败'
      if (!result.forceReQueue || attempt >= maxAttempts) {
        break
      }

      this.logger.warn(
        `[AutoShip] IM 页未就绪，${attempt < maxAttempts ? '等待重试' : '放弃'} shop=${shopId}: ${lastError}`
      )
      await this.sleep(2500)
      if (this.ensureImSession) {
        await this.ensureImSession(shopId).catch(() => false)
      }
    }

    // ★ 回退：XhsRim 不可用时（rim=fail），用 deliverByOrderSn（带 impaas-ws 直发回退）
    const fallback = await this.sendViaDeliverByOrderSn(shopId, orderId, content)
    if (fallback.success) return fallback

    return { success: false, error: lastError + (fallback.error ? ' | ' + fallback.error : '') }
  }

  /**
   * deliverByOrderSn 回退发码 — XhsRim 不可用时走 impaas zelda WS 直发
   * 对标 im-send.js window.__xhsAssistant.im.deliverByOrderSn
   */
  private async sendViaDeliverByOrderSn(
    shopId: string,
    orderId: string,
    content: string
  ): Promise<{ success: boolean; trackingNumber?: string; buyerId?: string; error?: string }> {
    const wc = (await this.pickImWcForShip(shopId)) || this.getImWcForShip(shopId)
    if (!wc || wc.isDestroyed()) {
      return { success: false, error: '无可用 IM WebContents' }
    }
    if (this.injectService) {
      await this.injectService.injectScriptAsync(wc, 'im-send').catch(() => false)
    }
    const result = (await wc
      .executeJavaScript(
        `(async function(){
          try {
            var im = window.__xhsAssistant && window.__xhsAssistant.im;
            if (!im || typeof im.deliverByOrderSn !== 'function') return { success: false, error: 'deliverByOrderSn 未注入' };
            return await im.deliverByOrderSn(${JSON.stringify(orderId)}, ${JSON.stringify(content)}, 'text');
          } catch (e) {
            return { success: false, error: String(e && e.message ? e.message : e) };
          }
        })()`
      )
      .catch((e) => ({ success: false, error: String(e) }))) as {
      success?: boolean
      buyerId?: string
      via?: string
      error?: string
    }
    if (result?.success) {
      this.logger.info(
        `[AutoShip] deliverByOrderSn 发码成功 order=${orderId} via=${result.via || '-'} buyer=${result.buyerId || '-'}`
      )
    } else {
      this.logger.warn(`[AutoShip] deliverByOrderSn 回退失败 order=${orderId}: ${result?.error || '-'}`)
    }
    return {
      success: !!result?.success,
      buyerId: result?.buyerId,
      trackingNumber: content.substring(0, 50),
      error: result?.error
    }
  }

  /** 找带 XhsRim 的客服页（对标阿奇锁：必须在 chat 页） */
  private getShipWcWithRim(preferredShopId?: string, exclude?: WebContents | null): WebContents | null {
    const candidates: WebContents[] = []
    const preferred = this.getShipWc(preferredShopId)
    if (preferred) candidates.push(preferred)
    for (const w of this.imByShop.values()) {
      if (w && !w.isDestroyed() && !candidates.includes(w)) candidates.push(w)
    }
    if (this.imWebContents && !this.imWebContents.isDestroyed() && !candidates.includes(this.imWebContents)) {
      candidates.push(this.imWebContents)
    }
    for (const cand of candidates) {
      if (exclude && cand === exclude) continue
      const url = cand.getURL() || ''
      if (!url.includes('walle.xiaohongshu.com') || url.includes('/login')) continue
      if (url.includes('/cstools/chat')) return cand
    }
    for (const cand of candidates) {
      if (exclude && cand === exclude) continue
      const url = cand.getURL() || ''
      if (url.includes('walle.xiaohongshu.com') && !url.includes('/login')) return cand
    }
    return null
  }

  private async waitForImReady(shopId: string, timeoutMs = 20000): Promise<WebContents | null> {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      const wc = this.getImWcForShip(shopId) || this.getShipWc(shopId)
      if (wc && !wc.isDestroyed()) {
        const url = wc.getURL() || ''
        if (url.includes('walle.xiaohongshu.com') && !url.includes('/login')) {
          const ok = await wc
            .executeJavaScript(
              `!!(window.__xhsAssistant && window.__xhsAssistant.im && typeof window.__xhsAssistant.im.deliverByOrderSn === 'function')`
            )
            .catch(() => false)
          if (ok) return wc
          const health = (await wc
            .executeJavaScript(
              `(async function(){
                if (!window.__xhsAssistant?.im?.checkImHealth) return null;
                return await window.__xhsAssistant.im.checkImHealth();
              })()`
            )
            .catch(() => null)) as { rim?: boolean; imLogin?: boolean; wsReady?: boolean } | null
          if (health?.imLogin && (health?.rim || health?.wsReady)) return wc
        }
      }
      await this.sleep(500)
    }
    return this.getImWcForShip(shopId)
  }
  private arkSyncInFlight = false
  private arkWatcherAttached = false
  private pendingSyncWaiters: Array<(r: { success: boolean; goods: any[]; error?: string }) => void> = []

  /**
   * 同步千帆后台商品列表（对标阿奇锁 getGoodsNoteList）
   * 登录成功后：存 Cookie → 拉商品 → 关窗 → 通知前端
   */
  async syncGoodsList(): Promise<{ success: boolean; goods: any[]; error?: string }> {
    try {
      return await this.syncGoodsListViaArkWindow()
    } catch (err: any) {
      return { success: false, goods: [], error: err.message || String(err) }
    }
  }

  /** 打开商家后台窗；登录成功后自动同步商品、存 Cookie、关窗 */
  openArkMerchantWindow(): { success: boolean; error?: string } {
    try {
      const win = this.ensureArkGoodsWindow(true)
      this.attachArkAutoSyncWatcher(win)
      win.loadURL(ARK_GOODS_SHELF_URL).catch((e) => {
        this.logger.warn('[AutoShip] 打开商家页失败: ' + e)
      })
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.message || String(err) }
    }
  }

  private async executeFetchGoodsList(
    wc: WebContents
  ): Promise<{ success: boolean; goods: any[]; error?: string }> {
    await this.seedArkAccessToken(wc)
    await this.injectService?.injectScriptAsync(wc, 'goods-sync')

    const goods = await withTimeout(
      wc.executeJavaScript(`
      (function(){
        if (!window.__xhsAssistant || !window.__xhsAssistant.goods || !window.__xhsAssistant.goods.fetchGoodsList) {
          return Promise.resolve({ __error: '商品同步脚本未注入' });
        }
        return window.__xhsAssistant.goods.fetchGoodsList().catch(function(e){
          return { __error: String(e && e.message || e) };
        });
      })()
    `),
      60000,
      { __error: '拉取商品超时' }
    )

    if (goods && (goods as any).__error) {
      return { success: false, goods: [], error: (goods as any).__error }
    }
    if (!Array.isArray(goods)) {
      return { success: false, goods: [], error: '商品列表返回异常' }
    }
    this.storage.saveSyncedGoods('default', goods)
    this.logger.info('[AutoShip] 同步商品列表成功: ' + goods.length + ' 个商品（已落库缓存）')
    return { success: true, goods }
  }

  private ensureArkGoodsWindow(show: boolean): BrowserWindow {
    if (this.goodsSyncWindow && !this.goodsSyncWindow.isDestroyed()) {
      if (show) {
        this.goodsSyncWindow.show()
        this.goodsSyncWindow.focus()
      }
      return this.goodsSyncWindow
    }

    const win = new BrowserWindow({
      show,
      width: 1280,
      height: 800,
      title: '千帆商家后台（商品同步）',
      autoHideMenuBar: true,
      webPreferences: {
        partition: partitionForShop(),
        nodeIntegration: false,
        contextIsolation: true,
        webSecurity: false
      }
    })
    this.goodsSyncWindow = win
    win.on('closed', () => {
      if (this.goodsSyncWindow === win) this.goodsSyncWindow = null
      this.arkWatcherAttached = false
      this.arkSyncInFlight = false
    })
    return win
  }

  /** 导航离开登录页后自动：存 Cookie → 同步商品 → 关窗 → 通知前端 */
  private attachArkAutoSyncWatcher(win: BrowserWindow) {
    if (this.arkWatcherAttached || win.isDestroyed()) return
    this.arkWatcherAttached = true
    const wc = win.webContents

    const trySync = async (reason: string) => {
      if (win.isDestroyed() || this.arkSyncInFlight) return
      const url = wc.getURL()
      if (!isArkAuthedUrl(url)) {
        if (isArkLoginUrl(url)) {
          win.setTitle('请登录千帆商家后台 — 登录成功后将自动同步')
        }
        return
      }

      const hasTok = await this.probeArkHasToken(wc)
      if (!hasTok) {
        this.logger.info(
          '[AutoShip] 商家页已离开登录但尚无 token(' + reason + '): ' + url.slice(0, 100)
        )
        return
      }

      this.arkSyncInFlight = true
      try {
        this.logger.info('[AutoShip] 检测到商家已登录(' + reason + ')，开始同步')
        win.setTitle('登录成功 — 正在保存会话并同步商品…')
        await new Promise((r) => setTimeout(r, 1200))
        if (win.isDestroyed()) return

        if (!/app-item\/list\/(shelf|all)|app-note/i.test(wc.getURL())) {
          await withTimeout(wc.loadURL(ARK_GOODS_SHELF_URL) as any, 25000, null)
          await new Promise((r) => setTimeout(r, 2000))
        }

        await this.saveArkCookies('default', wc)
        const result = await this.executeFetchGoodsList(wc)
        this.resolveArkSyncWaiters(result)

        try {
          const { BrowserWindow: BW } = require('electron')
          for (const w of BW.getAllWindows()) {
            if (!w.isDestroyed()) w.webContents.send('goods:sync-result', result)
          }
        } catch {
          /* ignore */
        }

        if (result.success) {
          win.setTitle('同步成功（' + result.goods.length + '）— 即将关闭')
          setTimeout(() => {
            try {
              if (!win.isDestroyed()) win.close()
            } catch {
              /* ignore */
            }
          }, 1000)
        } else {
          win.setTitle('同步失败 — 可刷新后重试')
          this.logger.warn('[AutoShip] 自动同步失败: ' + result.error)
        }
      } catch (e: any) {
        this.logger.error('[AutoShip] 自动同步异常:', e)
        this.resolveArkSyncWaiters({
          success: false,
          goods: [],
          error: String((e && e.message) || e)
        })
      } finally {
        this.arkSyncInFlight = false
      }
    }

    wc.on('did-navigate', (_e: any, url: string) => {
      this.logger.info('[AutoShip] did-navigate: ' + String(url).slice(0, 120))
      void trySync('did-navigate')
    })
    wc.on('did-navigate-in-page', () => {
      void trySync('in-page')
    })
    wc.on('did-finish-load', () => {
      void trySync('finish-load')
    })
    const poll = setInterval(() => {
      if (win.isDestroyed()) {
        clearInterval(poll)
        return
      }
      void trySync('poll')
    }, 2000)
    win.on('closed', () => clearInterval(poll))
  }

  private resolveArkSyncWaiters(result: { success: boolean; goods: any[]; error?: string }) {
    const list = this.pendingSyncWaiters.splice(0)
    for (const fn of list) {
      try {
        fn(result)
      } catch {
        /* ignore */
      }
    }
  }

  private waitForArkSyncResult(
    win: BrowserWindow,
    timeoutMs: number
  ): Promise<{ success: boolean; goods: any[]; error?: string } | null> {
    return new Promise((resolve) => {
      let settled = false
      const finish = (r: { success: boolean; goods: any[]; error?: string } | null) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        try {
          win.removeListener('closed', onClosed)
        } catch {
          /* ignore */
        }
        resolve(r)
      }
      const timer = setTimeout(() => finish(null), timeoutMs)
      this.pendingSyncWaiters.push((r) => finish(r))
      const onClosed = () => finish(null)
      win.once('closed', onClosed)
    })
  }

  private async syncGoodsListViaArkWindow(): Promise<{
    success: boolean
    goods: any[]
    error?: string
  }> {
    const win = this.ensureArkGoodsWindow(true)
    this.attachArkAutoSyncWatcher(win)
    const wc = win.webContents

    this.logger.info('[AutoShip] 打开千帆已上架商品页: ' + ARK_GOODS_SHELF_URL)
    win.setTitle('千帆商家后台 — 登录后将同步已上架商品')
    await withTimeout(wc.loadURL(ARK_GOODS_SHELF_URL) as any, 30000, null)
    await new Promise((r) => setTimeout(r, 800))

    const result = await this.waitForArkSyncResult(win, 300000)
    if (result) return result

    return {
      success: false,
      goods: [],
      error: '等待商家登录/同步超时。请在商家窗口完成登录，成功后会自动同步并关闭窗口'
    }
  }

  private async probeArkHasToken(wc: WebContents): Promise<boolean> {
    await this.seedArkAccessToken(wc)
    const v = await withTimeout(
      wc.executeJavaScript(`
        (function(){
          try {
            var t = localStorage.getItem('accessToken') || localStorage.getItem('access_token') || '';
            return !!(t && t.length >= 8);
          } catch(e) { return false; }
        })()
      `),
      3000,
      false
    )
    return !!v
  }

  private async seedArkAccessToken(wc: WebContents, shopId?: string): Promise<void> {
    try {
      const ses = session.fromPartition(partitionForShop(shopId))
      const cookies = await ses.cookies.get({})
      let token = ''
      for (const c of cookies) {
        const n = c.name || ''
        const v = String(c.value || '')
        if (v.length < 8) continue
        if (/access[-_]?token/i.test(n)) {
          token = v
          break
        }
      }
      await withTimeout(
        wc.executeJavaScript(
          '(function(tokenFromMain){ try { var pick = localStorage.getItem("accessToken") || localStorage.getItem("access_token") || sessionStorage.getItem("accessToken") || ""; if (!pick) { for (var i=0;i<localStorage.length;i++){ var k=localStorage.key(i); if(!k) continue; if(/access|token|auth/i.test(k)){ var vv=localStorage.getItem(k)||""; if(vv && vv.length>=8 && !/undefined|null|not_found/i.test(vv)){ pick=vv; break; } } } } if (!pick && tokenFromMain) pick = tokenFromMain; if (pick) { localStorage.setItem("accessToken", pick); return true; } } catch(e){} return false; })(' +
            JSON.stringify(token) +
            ')'
        ),
        4000,
        false
      )
    } catch (e) {
      this.logger.warn('[AutoShip] seedArkAccessToken 失败: ' + e)
    }
  }

  private async saveArkCookies(shopId: string, wc: WebContents): Promise<void> {
    try {
      const ses = session.fromPartition(partitionForShop())
      const cookies = await ses.cookies.get({})
      const xhsCookies = cookies.filter(
        (c) => c.domain?.includes('xiaohongshu.com') || c.domain?.includes('xhscdn.com')
      )
      const lsSnapshot = await withTimeout(
        wc.executeJavaScript(`(function(){ var out={}; try{ for(var i=0;i<localStorage.length;i++){ var k=localStorage.key(i); if(!k) continue; if(!/token|auth|user|seller|bUserId/i.test(k)) continue; var v=localStorage.getItem(k); if(v && v.length>=4 && v.length<8000) out[k]=v; } }catch(e){} return out; })()`) as Promise<
          Record<string, string>
        >,
        4000,
        {} as Record<string, string>
      )
      const encrypted = encrypt(
        JSON.stringify({
          cookies: xhsCookies,
          localStorage: lsSnapshot,
          savedAt: Date.now(),
          pageUrl: wc.getURL(),
          kind: 'ark'
        })
      )
      this.storage.saveShopCookies(shopId + '__ark', encrypted)
      this.logger.info(
        '[AutoShip] 商家 Cookie 已保存: count=' +
          xhsCookies.length +
          ', ls=' +
          (Object.keys(lsSnapshot || {}).join(',') || '-')
      )
    } catch (e) {
      this.logger.warn('[AutoShip] 保存商家 Cookie 失败: ' + e)
    }
  }

  /**
   * 扫描并重试失败订单（对标阿奇锁 MessageRetryTask.ProcessOrderImMsgRetryAsync）
   * - 乐观锁抢占：仅一个执行体能抢到同一条失败记录
   * - 断点续发：只补发未成功的消息条
   */
  async retryFailedDeliveries(maxRetry: number = 3): Promise<number> {
    const failed = this.storage.getFailedRetryableDeliveries(10, maxRetry)
    let retried = 0
    for (const item of failed as any[]) {
      // 乐观锁抢占（对标 WHERE SendStatus=?）
      if (!this.storage.tryClaimRetry(item.msg_guid)) continue
      retried++
      const shopId = item.shop_id
      const binding = item.binding_id ? this.storage.getAllProductBindings(shopId).find((b: any) => b.id === item.binding_id) : null
      const isLinkCard = String(binding?.deliver_type || '') === 'link_card'
      const type: 'text' | 'image' | 'video' | 'note' =
        binding?.deliver_type === 'image' ? 'image' :
        binding?.deliver_type === 'video' ? 'video' :
        binding?.deliver_type === 'note' ? 'note' : 'text'

      let sendContent = String(item.card_content || binding?.deliver_content || '')
      let cardConsumed = false
      let linkUrl = ''
      if (isLinkCard) {
        let url = String(item.card_content || '').trim()
        if (!url && this.psyCloud?.getToken()) {
          const alloc = await this.psyCloud.allocateForOrder(item.order_id, item.product_id)
          if (!alloc.success || !alloc.url) {
            this.storage.updateDeliveryStatus(item.msg_guid, 'fail', {
              errorMsg: alloc.message || '云端分配失败（重试）'
            })
            continue
          }
          url = alloc.url
        }
        if (!url) {
          this.storage.updateDeliveryStatus(item.msg_guid, 'fail', { errorMsg: '心象测未分配链接（重试）' })
          continue
        }
        linkUrl = url
        sendContent = renderTemplate(binding?.deliver_content || '{卡密}', {
          orderId: item.order_id,
          card: url,
          productName: binding?.product_name || ''
        })
      } else if (needsCard(sendContent) && !item.card_content) {
        const card = this.storage.lockCard(item.binding_id, item.order_id, !!binding?.random_mode)
        if (!card) {
          this.storage.updateDeliveryStatus(item.msg_guid, 'fail', { errorMsg: '卡密池已空（重试）' })
          continue
        }
        cardConsumed = true
        sendContent = renderTemplate(sendContent, { orderId: item.order_id, card })
      }

      const shipResult = await this.executeRealShip(item.shop_id || currentShopId(), item.order_id, sendContent, type)
      if (shipResult.success) {
        if (cardConsumed) this.storage.confirmCard(item.order_id)
        if (isLinkCard && linkUrl && item.binding_id) {
          this.storage.markCardUrlUsed(item.binding_id, linkUrl, item.order_id)
        }
        this.storage.updateDeliveryStatus(item.msg_guid, 'success', {
          buyerUid: shipResult.buyerId || item.buyer_uid || undefined
        })
        this.logger.info(`[AutoShip] 重试成功: ${item.order_id} [${item.msg_index}/${item.msg_total}]`)
      } else {
        if (cardConsumed) this.storage.rollbackCard(item.order_id)
        this.storage.updateDeliveryStatus(item.msg_guid, 'fail', { errorMsg: shipResult.error })
        this.logger.warn(`[AutoShip] 重试失败: ${item.order_id}`, shipResult.error)
      }
    }
    return retried
  }

  getProcessedCount(): number {
    return this.processedOrders.size
  }

  cleanupProcessed(keepCount: number = 1000) {
    if (this.processedOrders.size > keepCount * 2) {
      const arr = Array.from(this.processedOrders)
      this.processedOrders = new Set(arr.slice(-keepCount))
      this.logger.info(`[AutoShip] 清理已处理订单记录，保留 ${keepCount} 条`)
    }
  }

  dispose() {
    this.stopPolling()
    this.processedOrders.clear()
    this.monitorWebContents = null
    this.imWebContents = null
    this.monitorByShop.clear()
    this.imByShop.clear()
    for (const win of this.orderPollByShop.values()) {
      if (win && !win.isDestroyed()) {
        try {
          win.destroy()
        } catch {
          /* ignore */
        }
      }
    }
    this.orderPollByShop.clear()
    this.orderPollReadyAt.clear()
    if (this.goodsSyncWindow && !this.goodsSyncWindow.isDestroyed()) {
      try {
        this.goodsSyncWindow.destroy()
      } catch {
        /* ignore */
      }
    }
    this.goodsSyncWindow = null
  }
}
