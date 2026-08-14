import { app, BrowserWindow, BrowserView, ipcMain, session, shell, WebContents } from 'electron'
import { join } from 'path'
import { createTray } from './tray'
import { DeviceService } from './services/device.service'
import { LicenseService } from './services/license.service'
import { StorageService } from './services/storage.service'
import { LoggerService } from './services/logger.service'
import { WebSocketService } from './services/websocket.service'
import { ApiService } from './services/api.service'
import { InjectService } from './services/inject.service'
import { UpdateService } from './services/update.service'
import { AutoLoginService, XHS_DASHBOARD_URL, XHS_LOGIN_URL, XHS_CHAT_URL } from './services/auto-login.service'
import { CrashRecoveryService } from './services/crash-recovery.service'
import { MockService } from './services/mock.service'
import { AutoShipService } from './services/autoship.service'
import { AutoReshipService } from './services/autoreship.service'
import { ShopContextService } from './services/shop-context.service'
import { PsyCloudService } from './services/psy-cloud.service'
import { ensureSingleInstance } from './utils/singleton'
import { currentShopId, DEFAULT_SHOP_ID, newShopId, partitionForShop } from './utils/shop-partition'
import { CHROME_UA, applyElectronStealthFlags } from './constants/browser-env'
import { bindEvaNedbIpc, invokeDb } from './eva-nedb'

applyElectronStealthFlags(app)

// 无控制台启动时 stdout 断开会触发 EPIPE，必须在最早阶段吞掉
process.on('uncaughtException', (err: NodeJS.ErrnoException) => {
  if (err?.code === 'EPIPE' || err?.code === 'ERR_STREAM_DESTROYED') return
  try {
    const logDir = require('path').join(require('electron').app.getPath('userData'), 'Logs')
    require('fs').appendFileSync(
      require('path').join(logDir, 'uncaught.log'),
      `[${new Date().toISOString()}] ${err?.stack || err}\n`
    )
  } catch {
    // ignore
  }
})
process.stdout?.on?.('error', (err: NodeJS.ErrnoException) => {
  if (err?.code === 'EPIPE' || err?.code === 'ERR_STREAM_DESTROYED') return
})
process.stderr?.on?.('error', (err: NodeJS.ErrnoException) => {
  if (err?.code === 'EPIPE' || err?.code === 'ERR_STREAM_DESTROYED') return
})

// ==================== 布局常量（与 Vue UI 对齐）====================
const SIDEBAR_WIDTH = 180
const TITLEBAR_HEIGHT = 36
const BROWSER_TOOLBAR_HEIGHT = 44
const STATUSBAR_HEIGHT = 28
// 启动先打开客服登录页（与阿奇锁 LoginUrl 一致），登录后再进 dashboard
const XHS_START_URL = XHS_LOGIN_URL

// ==================== 全局服务实例 ====================
let mainWindow: BrowserWindow | null = null
let kefuWindow: BrowserWindow | null = null
let psyLoginWindow: BrowserWindow | null = null
let xhsBrowserView: BrowserView | null = null
const shopViews = new Map<string, BrowserView>()
const shopImWindows = new Map<string, BrowserWindow>()
const shopImCreating = new Map<string, Promise<BrowserWindow | null>>()
const preparedPartitions = new Set<string>()
let deviceService: DeviceService
let licenseService: LicenseService
let storageService: StorageService
let logger: LoggerService
let wsService: WebSocketService
let apiService: ApiService
let injectService: InjectService
let updateService: UpdateService
let autoLoginService: AutoLoginService
let crashRecoveryService: CrashRecoveryService
let mockService: MockService
let autoShipService: AutoShipService
let psyCloudService: PsyCloudService
let autoReshipService: AutoReshipService
let shopContextService: ShopContextService

function getBrowserViewBounds(): { x: number; y: number; width: number; height: number } {
  if (!mainWindow) {
    return {
      x: SIDEBAR_WIDTH,
      y: TITLEBAR_HEIGHT + BROWSER_TOOLBAR_HEIGHT,
      width: 800,
      height: 600
    }
  }
  const [winWidth, winHeight] = mainWindow.getContentSize()
  const top = TITLEBAR_HEIGHT + BROWSER_TOOLBAR_HEIGHT
  return {
    x: SIDEBAR_WIDTH,
    y: top,
    width: Math.max(winWidth - SIDEBAR_WIDTH, 100),
    height: Math.max(winHeight - top - STATUSBAR_HEIGHT, 100)
  }
}

function updateBrowserViewBounds() {
  if (!mainWindow || !xhsBrowserView) return
  xhsBrowserView.setBounds(getBrowserViewBounds())
  try {
    mainWindow.setTopBrowserView(xhsBrowserView)
  } catch {
    // ignore
  }
}

function focusXhsBrowserView() {
  if (!mainWindow || !xhsBrowserView) return
  try {
    mainWindow.addBrowserView(xhsBrowserView)
    updateBrowserViewBounds()
    mainWindow.setTopBrowserView(xhsBrowserView)
    xhsBrowserView.webContents.focus()
  } catch (e) {
    logger?.warn(`[XhsBrowser] focus 失败: ${e}`)
  }
}

/** 独立登录窗：验证码在 BrowserView 内常点不到，弹窗可正常点选 */
let loginAssistWindow: BrowserWindow | null = null

async function openLoginAssistWindow(reason = 'manual') {
  if (loginAssistWindow && !loginAssistWindow.isDestroyed()) {
    loginAssistWindow.show()
    loginAssistWindow.focus()
    return loginAssistWindow
  }

  loginAssistWindow = new BrowserWindow({
    width: 1080,
    height: 720,
    minWidth: 900,
    minHeight: 600,
    title: '客服登录 / 安全验证（请在此窗口完成验证）',
    parent: mainWindow || undefined,
    modal: false,
    autoHideMenuBar: true,
    webPreferences: getXhsWebPreferences()
  })

  loginAssistWindow.webContents.setUserAgent(CHROME_UA)
  logger.info(`[LoginAssist] 打开独立登录窗 reason=${reason}`)

  loginAssistWindow.webContents.on('dom-ready', () => {
    injectService?.injectOnDomReady(loginAssistWindow!.webContents)
    // 登录页强制注入 login-helper，方便验证码可点修补
    void injectService?.injectLoginHelper(loginAssistWindow!.webContents)
  })
  loginAssistWindow.webContents.on('did-finish-load', () => {
    injectService?.injectScripts(loginAssistWindow!.webContents)
    void injectService?.injectLoginHelper(loginAssistWindow!.webContents)
    loginAssistWindow?.webContents.focus()
  })

  loginAssistWindow.webContents.on('did-navigate', (_e, url) => {
    void onLoginAssistNavigated(url)
  })
  loginAssistWindow.webContents.on('did-navigate-in-page', (_e, url) => {
    void onLoginAssistNavigated(url)
  })

  loginAssistWindow.on('closed', () => {
    loginAssistWindow = null
  })

  await loginAssistWindow.loadURL(XHS_LOGIN_URL)
  loginAssistWindow.show()
  loginAssistWindow.focus()
  return loginAssistWindow
}

async function onLoginAssistNavigated(url: string) {
  if (!url.includes('walle.xiaohongshu.com/cstools/')) return
  if (url.includes('/login')) return
  logger.info(`[LoginAssist] 登录成功，同步主视图: ${url}`)
  const shopId = (global as any).currentShopId || 'default'
  try {
    if (xhsBrowserView && autoLoginService) {
      await xhsBrowserView.webContents.loadURL(url.includes('/cstools/') ? url : XHS_DASHBOARD_URL)
      focusXhsBrowserView()
      await autoLoginService.saveCookies(shopId, xhsBrowserView.webContents)
      await shopContextService?.initializePhase2(shopId)
      wsService?.reconnectKefu()
      mainWindow?.webContents.send('login-assist-done', { url })
    }
  } catch (e) {
    logger.warn(`[LoginAssist] 同步失败: ${e}`)
  }
  if (loginAssistWindow && !loginAssistWindow.isDestroyed()) {
    loginAssistWindow.close()
  }
}

async function showAndLoadXhs(url?: string) {
  if (!mainWindow) return false
  const view = createXhsBrowserView()
  const targetUrl = url || XHS_START_URL
  logger.info(`[XhsBrowser] 加载: ${targetUrl}`)

  mainWindow.addBrowserView(view)
  updateBrowserViewBounds()

  try {
    await view.webContents.loadURL(targetUrl)
    mainWindow.webContents.send('browser:url-changed', targetUrl)
    return true
  } catch (err) {
    logger.error('[XhsBrowser] 加载失败:', err)
    return false
  }
}

let last401HandleAt = 0
let handling401 = false

async function handle401Redirect(sourceUrl?: string) {
  if (!xhsBrowserView || !autoLoginService) return
  const currentUrl = xhsBrowserView.webContents.getURL()

  // 工作台壳还在：对齐阿奇锁——401 不强制踢登录（很多次要接口会 401）
  if (
    currentUrl.includes('walle.xiaohongshu.com/cstools/') &&
    !currentUrl.includes('/login')
  ) {
    const shellOk = await autoLoginService.isWorkbenchShellReady(xhsBrowserView.webContents)
    if (shellOk || (await autoLoginService.hasSsoSessionCookies())) {
      logger.info(`[401] 工作台仍有效，忽略: ${String(sourceUrl || '').slice(0, 100)}`)
      return
    }
  }

  // 已在客服登录页：不再 reload，避免表单被刷没
  if (currentUrl.includes('/cstools/login') && !currentUrl.includes('customer.xiaohongshu.com')) {
    logger.info('[401] 已在客服登录页，等待手动登录')
    mainWindow?.webContents.send('login-required', { reason: 'cookie_expired' })
    return
  }
  // 误落商家登录页：改回客服登录
  if (
    currentUrl.includes('customer.xiaohongshu.com') ||
    currentUrl.includes('ark.xiaohongshu.com/ark/login')
  ) {
    logger.warn('[401] 当前在商家登录页，改回客服登录页')
    await xhsBrowserView.webContents.loadURL(XHS_LOGIN_URL)
    mainWindow?.webContents.send('login-required', { reason: 'cookie_expired' })
    return
  }

  // 次要接口 401 / get_csa 裸请求 401：禁止踢登录（会冲掉会话列表）
  if (sourceUrl) {
    const ignore =
      sourceUrl.includes('customer.xiaohongshu.com') ||
      sourceUrl.includes('/cstools/login') ||
      sourceUrl.includes('/login') ||
      sourceUrl.includes('get_csa_info') ||
      sourceUrl.includes('get_cs_notification') ||
      sourceUrl.includes('get_csa_gray_info') ||
      sourceUrl.includes('seller-rule/exam') ||
      sourceUrl.includes('seller/notification') ||
      sourceUrl.includes('seller-bot') ||
      sourceUrl.includes('/faq/') ||
      sourceUrl.includes('ark.xiaohongshu.com')
    if (ignore) {
      logger.info(`[401] 忽略次要/可软失败接口: ${String(sourceUrl).slice(0, 120)}`)
      return
    }
  }

  // 工作台已有 SSO Cookie：只提示，不强制跳登录
  if (await autoLoginService.hasSsoSessionCookies()) {
    logger.warn(`[401] 有 SSO Cookie，忽略重定向: ${String(sourceUrl || currentUrl).slice(0, 120)}`)
    return
  }

  const now = Date.now()
  if (handling401 || now - last401HandleAt < 15000) {
    return
  }
  handling401 = true
  last401HandleAt = now
  logger.info('[XhsRedirectOn401] 401 重定向登录，即将跳转')
  const shopId = (global as any).currentShopId || 'default'
  try {
    const success = await autoLoginService.tryAutoLoginIfNeeded(
      shopId,
      xhsBrowserView.webContents,
      XHS_DASHBOARD_URL
    )

    if (!success) {
      logger.warn('[401] 自动登录失败，需要手动登录')
      mainWindow?.webContents.send('login-required', { reason: 'cookie_expired' })
    } else {
      await shopContextService?.initializePhase2(shopId)
      wsService?.reconnectKefu()
    }
  } finally {
    handling401 = false
  }
}

function startCookieWatchdog() {
  setInterval(async () => {
    if (!xhsBrowserView || !autoLoginService) return
    const shopId = (global as any).currentShopId || 'default'
    const url = xhsBrowserView.webContents.getURL()
    if (!url.includes('walle.xiaohongshu.com')) return
    await autoLoginService.checkAndRefreshCookie(shopId, xhsBrowserView.webContents, XHS_DASHBOARD_URL)
  }, 5 * 60 * 1000)
}

/** 登录成功跳到工作台后补 Phase2 / 鉴权 Cookie（拦截器 postMessage 可能丢） */
let lastWorkbenchPhase2At = 0
/** 防止误进商家 ark/customer 登录页后死循环回跳 */
let lastMerchantLoginGuardAt = 0

/**
 * 主窗口只服务客服工作台：
 * - 订单探测走 API 注入，不需要打开 ark 商家后台页面
 * - 误跳到 customer/ark 登录时，有 SSO 则回工作台，否则回 cstools/login
 */
async function guardAgainstMerchantLoginPage(url: string) {
  if (!xhsBrowserView || !autoLoginService) return
  const isMerchantLogin =
    /customer\.xiaohongshu\.com/i.test(url) ||
    /ark\.xiaohongshu\.com\/ark\/login/i.test(url) ||
    (/ark\.xiaohongshu\.com/i.test(url) && /[?&]service=/i.test(url) && /login/i.test(url))
  if (!isMerchantLogin) return

  const now = Date.now()
  if (now - lastMerchantLoginGuardAt < 2500) return
  lastMerchantLoginGuardAt = now

  const hasSso = await autoLoginService.hasSsoSessionCookies()
  const target = hasSso ? XHS_DASHBOARD_URL : XHS_LOGIN_URL
  logger.warn(
    `[XhsBrowser] 拦截商家后台登录页，改回客服链路 hasSso=${hasSso} → ${target}`
  )
  try {
    await xhsBrowserView.webContents.loadURL(target)
  } catch (e) {
    logger.warn(`[XhsBrowser] 回跳失败: ${e}`)
  }
  if (!hasSso) {
    mainWindow?.webContents.send('login-required', { reason: 'need_kefu_login' })
  }
}

async function onWorkbenchNavigated(url: string) {
  if (!autoLoginService || !shopContextService) return
  if (!url.includes('walle.xiaohongshu.com/cstools/')) return
  if (url.includes('/login')) return
  const now = Date.now()
  if (now - lastWorkbenchPhase2At < 8000) return
  lastWorkbenchPhase2At = now
  const shopId = (global as any).currentShopId || 'default'
  try {
    if (!xhsBrowserView) return
    const ok = await autoLoginService.checkLoginStatus(xhsBrowserView.webContents)
    if (!ok) return
    logger.info(`[Login] 工作台已就绪，补全鉴权与 Phase2: ${url}`)
    await autoLoginService.saveCookies(shopId, xhsBrowserView.webContents)
    await shopContextService.initializePhase2(shopId)
    wsService?.reconnectKefu()
  } catch (e) {
    logger.warn(`[Login] 工作台导航后处理失败: ${e}`)
  }
}

function bindXhsBrowserViewEvents(view: BrowserView) {
  const wc = view.webContents

  wc.on('dom-ready', () => injectService?.injectOnDomReady(wc))
  wc.on('did-finish-load', async () => {
    injectService?.injectScripts(wc)
    try {
      await autoLoginService?.applyPendingLocalStorage(wc)
    } catch {
      // ignore
    }
  })

  wc.on('did-navigate', (_event, url) => {
    mainWindow?.webContents.send('browser:url-changed', url)
    void guardAgainstMerchantLoginPage(url)
    void onWorkbenchNavigated(url)
  })
  wc.on('did-navigate-in-page', (_event, url) => {
    mainWindow?.webContents.send('browser:url-changed', url)
    void onWorkbenchNavigated(url)
  })
  wc.on('did-start-loading', () => mainWindow?.webContents.send('browser:loading', true))
  wc.on('did-stop-loading', () => mainWindow?.webContents.send('browser:loading', false))

  wc.on('did-redirect-navigation', (_event, url) => {
    void guardAgainstMerchantLoginPage(url)
    if (
      url.includes('/cstools/login') ||
      url.includes('customer.xiaohongshu.com/login') ||
      url.includes('ark.xiaohongshu.com/ark/login')
    ) {
      logger.info(`[XhsBrowser] 跳转到登录页: ${url}`)
      mainWindow?.webContents.send('login-required', { reason: 'redirect_to_login' })
    }
  })

  wc.on('render-process-gone', async (_event, details) => {
    logger.error(`[XhsBrowser] 渲染进程崩溃: ${details.reason}`)
    if (crashRecoveryService) {
      await crashRecoveryService.handleWebContentsCrash(wc, details)
    }
  })

  wc.setWindowOpenHandler(({ url }) => {
    // 小红书域登录/鉴权弹窗必须留在应用内；外链才走系统浏览器
    if (/xiaohongshu\.com|xhscdn\.com/i.test(url || '')) {
      return { action: 'allow' }
    }
    if (url) shell.openExternal(url)
    return { action: 'deny' }
  })
}

// ==================== 应用初始化 ====================
async function initialize() {
  logger = new LoggerService()
  logger.info('====================程序启动====================')
  logger.info(`当前版本为${app.getVersion()}`)

  ensureSingleInstance()

  storageService = new StorageService(logger)
  deviceService = new DeviceService()
  licenseService = new LicenseService(storageService, deviceService, logger)

  const licenseValid = await licenseService.checkLicense()
  if (!licenseValid) {
    logger.warn('授权验证失败，需要激活')
  }

  apiService = new ApiService(logger)
  apiService.start()

  wsService = new WebSocketService(logger, storageService)
  injectService = new InjectService(logger)
  injectService.setupRequestInterception('persist:main')

  autoLoginService = new AutoLoginService(logger, storageService, injectService)
  injectService.setCsaHttpOkHandler((url) => {
    // 注意：HTTP 200 ≠ 业务成功；真正 mark 只在 xhs-csa-info success=true
    logger.info(`[KefuAutoLogin] 观测到 get_csa_info HTTP 完成 ${url.slice(0, 80)}（等业务 success 再 mark）`)
  })
  // P0：清掉历史上假成功落库的 Cookie（只有 a1/webId）
  try {
    const sid = String((global as any).currentShopId || 'default')
    autoLoginService.purgeInvalidStoredCookies(sid)
    await autoLoginService.clearWeakSessionCookies()
  } catch (e) {
    logger.warn(`[AutoLogin] 启动清理假 Cookie 失败: ${e}`)
  }
  crashRecoveryService = new CrashRecoveryService(logger)
  mockService = new MockService(logger)
  if (process.env.NODE_ENV === 'development' || process.env.XHS_MOCK === 'true') {
    mockService.setEnabled(true)
  }

  autoShipService = new AutoShipService(storageService, logger, mockService)
  autoShipService.setInjectService(injectService)
  psyCloudService = new PsyCloudService(storageService, logger)
  autoShipService.setPsyCloud(psyCloudService)
  autoShipService.setEnsureImSession(async (sid) => {
    const win = await ensureShopImWindow(sid, { show: false })
    return !!(win && !win.isDestroyed())
  })
  autoReshipService = new AutoReshipService(storageService, logger, autoShipService)
  shopContextService = new ShopContextService(
    logger, storageService, wsService, autoShipService, autoReshipService, mockService
  )
  shopContextService.setEnsureImSession(async (sid) => {
    const win = await ensureShopImWindow(sid, { show: false })
    return !!(win && !win.isDestroyed())
  })

  // 启动时自动扫描失败订单重试（对标阿奇锁 MessageRetryTask 定时任务）
  const retryFailedOrders = async () => {
    try {
      const count = await autoShipService.retryFailedDeliveries(3)
      if (count > 0) logger.info(`[RetryTask] 本轮重试失败订单 ${count} 条`)
    } catch (err) {
      logger.error('[RetryTask] 重试失败订单异常:', err)
    }
  }
  // 启动后延迟 10 秒首次扫描，之后每 5 分钟一次
  setTimeout(retryFailedOrders, 10 * 1000)
  setInterval(retryFailedOrders, 5 * 60 * 1000)

  updateService = new UpdateService(logger)
  updateService.checkForUpdates()
  updateService.startPeriodicCheck()

  applyAutoStartSetting()

  ;(global as any).deviceService = deviceService
  ;(global as any).licenseService = licenseService
  ;(global as any).storageService = storageService
  ;(global as any).wsService = wsService
  ;(global as any).autoLoginService = autoLoginService
  ;(global as any).autoShipService = autoShipService
  ;(global as any).autoReshipService = autoReshipService
  ;(global as any).mockService = mockService
  ;(global as any).currentShopId = storageService.getActiveShopId() || DEFAULT_SHOP_ID
  ;(global as any).openLoginAssistWindow = openLoginAssistWindow
  prepareShopPartition(currentShopId())
  setupEvaIpcStubs()

  wsService.start()
  logger.info('初始化完成')
}

function applyAutoStartSetting() {
  const autoStart = storageService.get<boolean>('autoStart')
  app.setLoginItemSettings({
    openAtLogin: !!autoStart,
    path: process.execPath,
    args: []
  })
  logger.info(`[Settings] 开机自启: ${autoStart ? '已启用' : '已禁用'}`)
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: '小红书发货助手',
    icon: join(__dirname, '../resources/icon.ico'),
    frame: false,
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      partition: 'persist:main'
    },
    show: false
  })

  wsService.setMainWindow(mainWindow)

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../dist/index.html'))
  }

  mainWindow.once('ready-to-show', async () => {
    mainWindow?.show()
    mainWindow?.webContents.send('navigate', '/browser')

    // 保活：优先注入已存 Cookie → 直接进工作台；失效才打开客服登录页（永不默认打开 ark）
    const shopId = currentShopId()
    await showAndLoadXhs('about:blank')
    autoShipService.bindWebContents(xhsBrowserView!.webContents, shopId)
    autoReshipService.bindWebContents(xhsBrowserView!.webContents)

    let ok = false
    try {
      const injected = await autoLoginService.loadAndInjectCookies(shopId)
      if (injected) {
        await xhsBrowserView!.webContents.loadURL(XHS_DASHBOARD_URL)
        await new Promise((r) => setTimeout(r, 2500))
      }
      ok = await autoLoginService.checkLoginStatus(xhsBrowserView!.webContents)
      if (!ok) {
        ok = await autoLoginService.tryAutoLoginIfNeeded(
          shopId,
          xhsBrowserView!.webContents,
          XHS_DASHBOARD_URL
        )
      }
    } catch (e) {
      logger.warn(`[Login] 启动保活失败: ${e}`)
    }

    if (ok) {
      await autoLoginService.saveCookies(shopId, xhsBrowserView!.webContents)
      const cur = xhsBrowserView!.webContents.getURL()
      if (!cur.includes('walle.xiaohongshu.com/cstools/') || cur.includes('/login')) {
        await xhsBrowserView!.webContents.loadURL(XHS_DASHBOARD_URL)
      }
      await shopContextService.initializePhase2(shopId)
      logger.info('[Login] 登录保活成功，已进入客服工作台')
      for (const shop of storageService.listShops()) {
        if (shop.id && shop.id !== shopId && storageService.getShopCookies(shop.id)) {
          void ensureShopImWindow(shop.id, { show: false })
        }
      }
    } else {
      await showAndLoadXhs(XHS_LOGIN_URL)
      logger.info('[Login] 需手动登录：请用客服邮箱登录（不是商家扫码）')
      mainWindow?.webContents.send('login-required', { reason: 'need_manual_login' })
    }

    startCookieWatchdog()
  })

  mainWindow.on('close', (event) => {
    if (!(app as any).isQuitting) {
      event.preventDefault()
      mainWindow?.hide()
      logger.info('窗口最小化到托盘')
    }
  })

  mainWindow.on('resize', () => updateBrowserViewBounds())

  if (crashRecoveryService) {
    crashRecoveryService.bind(mainWindow)
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  // 托盘菜单导航
  mainWindow.webContents.on('did-finish-load', () => {
    ipcMain.removeAllListeners('internal:navigate')
  })

  return mainWindow
}

/**
 * 对标官方千帆 BrowserView：
 * - webSecurity:false → 允许 walle 页请求 eva.xiaohongshu.com（客服列表依赖）
 * - nodeIntegration:true → Eva 内 require("electron") 可用
 */
function prepareShopPartition(shopId?: string) {
  const part = partitionForShop(shopId)
  if (preparedPartitions.has(part)) return part
  preparedPartitions.add(part)
  const ses = session.fromPartition(part)
  ses.setUserAgent(CHROME_UA)
  setupXhsSessionRequestHooks(ses)
  injectService?.setupRequestInterception(part)
  return part
}

function emitShopChanged() {
  const sid = currentShopId()
  const shops = storageService?.listShops?.() || []
  mainWindow?.webContents.send('shop:changed', {
    currentId: sid,
    shops
  })
}

function getXhsWebPreferences(shopId?: string) {
  return {
    preload: join(__dirname, 'xhs-preload.js'),
    nodeIntegration: true,
    contextIsolation: false,
    webSecurity: false,
    partition: partitionForShop(shopId),
    sandbox: false,
    backgroundThrottling: false
  }
}

function setupXhsSessionRequestHooks(ses: ReturnType<typeof session.fromPartition>) {
  try {
    ses.webRequest.onBeforeSendHeaders(
      {
        urls: [
          '*://*.xiaohongshu.com/*/api/edith/*',
          '*://*.xiaohongshu.com/api/edith/*',
          '*://*.xiaohongshu.com/api/*/edith/*',
          '*://*.xiaohongshu.com/api/cas/customer/web/service-ticket'
        ]
      },
      (details, callback) => {
        const headers = { ...details.requestHeaders }
        const referrer = details.referrer || details.requestHeaders?.Referer || ''
        if (referrer && !headers.Origin) {
          try {
            headers.Origin = new URL(referrer).origin
          } catch {
            // ignore
          }
        }
        callback({ requestHeaders: headers })
      }
    )
  } catch (err) {
    logger?.warn(`[XhsSession] onBeforeSendHeaders 设置失败: ${err}`)
  }
}

function setupEvaIpcStubs() {
  // 对标官方：ipcMain.on('db:registDb') + handle('db:invokeFn') 走真实 NeDB
  bindEvaNedbIpc()
  try {
    ipcMain.removeHandler('db:invokeFn')
  } catch {
    // ignore
  }
  ipcMain.handle('db:invokeFn', async (_event, dbName: string, fnName: string, ...rest: unknown[]) => {
    const name = String(dbName || 'default')
    const fn = String(fnName || '')
    logger?.info(`[EvaIPC] db:invokeFn ${name}.${fn}`)
    return invokeDb(name, fn, rest)
  })

  // 官方：ipcMain.handle("tab:getAllLogin", () => tabList.map(v => v.bUserId))
  // 新店空分区必须返回 []，否则 Eva 当成已登录账号恢复失败 →「登录已过期」
  try {
    ipcMain.removeHandler('tab:getAllLogin')
  } catch {
    /* ignore */
  }
  ipcMain.handle('tab:getAllLogin', () => [])

  try {
    ipcMain.removeHandler('globalShortcut')
  } catch {
    /* ignore */
  }
  ipcMain.handle('globalShortcut', () => true)

  // 官方千帆内部 channel；缺注册会导致客服页 Uncaught promise
  const channels = ['handle-invoke-method', 'invoke-current-win-function']
  for (const ch of channels) {
    try {
      ipcMain.removeHandler(ch)
    } catch {
      // ignore
    }
    ipcMain.handle(ch, async (_event, ...args) => {
      logger?.info(`[EvaIPC] ${ch} args=${JSON.stringify(args).slice(0, 120)}`)
      const blob = JSON.stringify(args || []).toLowerCase()
      if (/logout|signout|退出/.test(blob)) {
        void logoutCurrentShop()
        return true
      }
      if (/addaccount|addshop|addtab|newclient|添加多账号|添加账号/.test(blob)) {
        void addShopAccount()
        return true
      }
      if (ch === 'invoke-current-win-function') {
        const fn = String(args[0] || '')
        if (fn === 'minimize') mainWindow?.minimize()
        if (fn === 'close') mainWindow?.hide()
        if (fn === 'maximize') {
          if (mainWindow?.isMaximized()) mainWindow.unmaximize()
          else mainWindow?.maximize()
        }
        return true
      }
      return null
    })
  }
}

function createXhsBrowserView(shopId?: string): BrowserView {
  const sid = shopId || currentShopId()
  const existing = shopViews.get(sid)
  if (existing) {
    xhsBrowserView = existing
    return existing
  }
  prepareShopPartition(sid)
  const view = new BrowserView({
    webPreferences: getXhsWebPreferences(sid)
  })
  view.webContents.setUserAgent(CHROME_UA)
  bindXhsBrowserViewEvents(view)
  shopViews.set(sid, view)
  xhsBrowserView = view
  autoShipService?.bindWebContents(view.webContents, sid)
  autoReshipService?.bindWebContents(view.webContents)
  return view
}

async function switchToShop(shopId: string): Promise<boolean> {
  const sid = String(shopId || DEFAULT_SHOP_ID).trim() || DEFAULT_SHOP_ID
  if (mainWindow && xhsBrowserView) {
    try {
      mainWindow.removeBrowserView(xhsBrowserView)
    } catch {
      /* ignore */
    }
  }
  ;(global as any).currentShopId = sid
  storageService.setActiveShopId(sid)
  const view = createXhsBrowserView(sid)
  if (mainWindow) {
    mainWindow.addBrowserView(view)
    updateBrowserViewBounds()
  }
  autoShipService?.bindWebContents(view.webContents, sid)
  autoReshipService?.bindWebContents(view.webContents)
  wsService?.reconnectKefu()
  emitShopChanged()
  logger.info(`[Shop] 已切换店铺 ${sid} partition=${partitionForShop(sid)}`)
  return true
}

async function addShopAccount(): Promise<{ success: boolean; shopId?: string; message?: string }> {
  const limit = Math.max(1, Number(licenseService.getShopLimit() || 1))
  const shops = storageService.listShops()
  if (shops.length >= limit) {
    return { success: false, message: `当前授权最多 ${limit} 个店铺，无法再添加` }
  }
  const id = newShopId()
  storageService.saveShopConfig(id, {
    shopName: `店铺 ${shops.length + 1}`,
    autoShipEnabled: true,
    autoReplyEnabled: false
  })
  autoLoginService.clearLogoutHold(id)
  const part = partitionForShop(id)
  try {
    await session.fromPartition(part).clearStorageData()
  } catch {
    /* 新分区无数据 */
  }
  await switchToShop(id)
  await showAndLoadXhs(XHS_LOGIN_URL)
  mainWindow?.webContents.send('navigate', '/browser')
  logger.info(`[Shop] 已添加店铺 ${id}，请用该店客服账号登录`)
  return { success: true, shopId: id }
}

async function logoutCurrentShop(): Promise<boolean> {
  const sid = currentShopId()
  await destroyShopImWindow(sid)
  await autoLoginService.clearShopSession(sid)
  await showAndLoadXhs(XHS_LOGIN_URL)
  mainWindow?.webContents.send('navigate', '/browser')
  emitShopChanged()
  logger.info(`[Shop] 已退出店铺 ${sid}`)
  return true
}

function shopIdFromWebContents(wc: WebContents | null | undefined): string | null {
  if (!wc) return null
  for (const [id, view] of shopViews) {
    if (view.webContents.id === wc.id) return id
  }
  for (const [id, win] of shopImWindows) {
    if (!win.isDestroyed() && win.webContents.id === wc.id) return id
  }
  return null
}

async function ensureShopImWindow(
  shopId: string,
  opts?: { show?: boolean }
): Promise<BrowserWindow | null> {
  const sid = String(shopId || currentShopId()).trim() || DEFAULT_SHOP_ID
  const existing = shopImWindows.get(sid)
  if (existing && !existing.isDestroyed()) {
    if (opts?.show) {
      existing.setSkipTaskbar(false)
      existing.show()
      existing.focus()
      kefuWindow = existing
    }
    return existing
  }
  const pending = shopImCreating.get(sid)
  if (pending) {
    const win = await pending
    if (opts?.show && win && !win.isDestroyed()) {
      win.setSkipTaskbar(false)
      win.show()
      win.focus()
      kefuWindow = win
    }
    return win
  }
  const created = createShopImWindow(sid, !!opts?.show)
  shopImCreating.set(sid, created)
  try {
    return await created
  } finally {
    shopImCreating.delete(sid)
  }
}

async function createShopImWindow(shopId: string, show: boolean): Promise<BrowserWindow | null> {
  prepareShopPartition(shopId)
  const win = new BrowserWindow({
    show,
    width: 1100,
    height: 760,
    title: '客服聊天',
    skipTaskbar: !show,
    webPreferences: {
      ...getXhsWebPreferences(shopId),
      backgroundThrottling: false
    }
  })
  win.webContents.setUserAgent(CHROME_UA)
  shopImWindows.set(shopId, win)
  if (show) kefuWindow = win

  win.on('close', (e) => {
    if ((app as any).isQuitting || (win as any).__allowClose) return
    e.preventDefault()
    win.setSkipTaskbar(true)
    win.hide()
  })
  win.on('closed', () => {
    if (shopImWindows.get(shopId) === win) shopImWindows.delete(shopId)
    if (kefuWindow === win) kefuWindow = null
    autoShipService?.unbindImWebContents(shopId)
  })

  win.webContents.on('dom-ready', () => injectService?.injectOnDomReady(win.webContents))
  win.webContents.on('did-finish-load', async () => {
    injectService?.injectScripts(win.webContents)
    autoShipService?.bindImWebContents(win.webContents, shopId)
    try {
      const isLoggedIn = await autoLoginService.checkLoginStatus(win.webContents)
      if (!isLoggedIn) {
        logger.warn(`[KefuBrowser] 店铺 ${shopId} Cookie 可能过期，尝试自动登录`)
        await autoLoginService.autoLogin(shopId, win.webContents, XHS_CHAT_URL)
      } else {
        await autoLoginService.syncEvaAuthCookies(win.webContents)
      }
    } catch (err) {
      logger.warn(`[KefuBrowser] 店铺 ${shopId} 会话检查失败: ${err}`)
    }
  })
  win.webContents.on('render-process-gone', async (_event, details) => {
    logger.warn(`[客服窗口] 店铺 ${shopId} 渲染进程崩溃: ${details.reason}`)
    if (!win.isDestroyed()) win.reload()
  })

  try {
    await win.loadURL(XHS_CHAT_URL)
  } catch (err) {
    logger.warn(`[KefuBrowser] 店铺 ${shopId} 加载聊天页失败: ${err}`)
  }
  autoShipService?.bindImWebContents(win.webContents, shopId)
  logger.info(`[KefuBrowser] 已就绪 shop=${shopId} show=${show} partition=${partitionForShop(shopId)}`)
  return win
}

async function destroyShopImWindow(shopId: string): Promise<void> {
  const win = shopImWindows.get(shopId)
  if (!win) return
  shopImWindows.delete(shopId)
  ;(win as any).__allowClose = true
  if (kefuWindow === win) kefuWindow = null
  autoShipService?.unbindImWebContents(shopId)
  if (!win.isDestroyed()) {
    try {
      win.destroy()
    } catch {
      /* ignore */
    }
  }
}

function destroyAllShopImWindows() {
  for (const id of [...shopImWindows.keys()]) {
    void destroyShopImWindow(id)
  }
}

function createKefuWindow() {
  void ensureShopImWindow(currentShopId(), { show: true })
}

// ==================== IPC 通信 ====================
function setupIPC() {
  ipcMain.handle('device:get-code', async () => deviceService.getDeviceCode())
  ipcMain.handle('device:get-info', async () => deviceService.getHardwareInfo())

  ipcMain.handle('license:check', async () => licenseService.checkLicense())
  ipcMain.handle('license:activate', async (_event, licenseKey: string) => licenseService.activate(licenseKey))
  ipcMain.handle('license:status', async () => licenseService.getStatus())
  ipcMain.handle('license:has-feature', (_event, feature: string) => licenseService.hasFeature(feature))
  ipcMain.handle('license:edition', () => licenseService.getEdition())
  ipcMain.handle('license:shop-limit', () => licenseService.getShopLimit())

  ipcMain.handle('browser:load', async (_event, url: string) => {
    return showAndLoadXhs(url || XHS_START_URL)
  })

  ipcMain.handle('browser:route', (_event, path: string) => {
    if (!mainWindow || !xhsBrowserView) return false
    if (path === '/browser') {
      focusXhsBrowserView()
    } else {
      mainWindow.removeBrowserView(xhsBrowserView)
    }
    return true
  })

  ipcMain.handle('browser:show', () => {
    if (!mainWindow || !xhsBrowserView) return false
    focusXhsBrowserView()
    return true
  })

  ipcMain.handle('browser:focus', () => {
    focusXhsBrowserView()
    return true
  })

  ipcMain.handle('browser:open-login-assist', async () => {
    await openLoginAssistWindow('ui')
    return true
  })

  ipcMain.on('captcha-required', () => {
    void openLoginAssistWindow('captcha')
  })

  ipcMain.handle('browser:hide', () => {
    if (!mainWindow || !xhsBrowserView) return false
    mainWindow.removeBrowserView(xhsBrowserView)
    return true
  })

  ipcMain.handle('browser:set-bounds', (_event, bounds) => {
    xhsBrowserView?.setBounds(bounds)
    return true
  })

  ipcMain.handle('browser:go-back', () => {
    if (xhsBrowserView?.webContents.canGoBack()) {
      xhsBrowserView.webContents.goBack()
      return true
    }
    return false
  })

  ipcMain.handle('browser:go-forward', () => {
    if (xhsBrowserView?.webContents.canGoForward()) {
      xhsBrowserView.webContents.goForward()
      return true
    }
    return false
  })

  ipcMain.handle('browser:reload', () => {
    xhsBrowserView?.webContents.reload()
    return true
  })

  ipcMain.handle('browser:get-url', () => xhsBrowserView?.webContents.getURL() || '')
  ipcMain.handle('browser:can-go-back', () => xhsBrowserView?.webContents.canGoBack() ?? false)
  ipcMain.handle('browser:can-go-forward', () => xhsBrowserView?.webContents.canGoForward() ?? false)

  ipcMain.handle('window:minimize', () => mainWindow?.minimize())
  ipcMain.handle('window:maximize', () => {
    if (mainWindow?.isMaximized()) mainWindow.unmaximize()
    else mainWindow?.maximize()
  })
  ipcMain.handle('window:close', () => mainWindow?.hide())
  ipcMain.handle('window:is-maximized', () => mainWindow?.isMaximized() ?? false)

  ipcMain.handle('config:get', (_event, key: string) => storageService.get(key))
  ipcMain.handle('config:set', (_event, key: string, value: unknown) => {
    storageService.set(key, value)
    if (key === 'autoStart') applyAutoStartSetting()
    if (key === 'wsUrl' || key === 'heartbeatInterval') wsService?.reconnect()
    return true
  })
  ipcMain.handle('config:getAll', () => storageService.getAll())

  ipcMain.handle('log:get', (_event, lines: number) => logger.getRecentLogs(lines))
  ipcMain.handle('ws:status', () => wsService.getStatus())
  ipcMain.handle('ws:reconnect', () => { wsService.reconnect(); return true })

  ipcMain.handle('update:check', async () => updateService.checkForUpdates())
  ipcMain.handle('update:download', async () => updateService.downloadUpdate())
  ipcMain.handle('update:install', () => updateService.installUpdate())

  ipcMain.handle('autologin:check', async () => {
    if (!xhsBrowserView) return false
    return autoLoginService.checkLoginStatus(xhsBrowserView.webContents)
  })
  ipcMain.handle('autologin:save-cookies', async (_event, shopId: string) => {
    if (!xhsBrowserView) return false
    return autoLoginService.saveCookies(shopId, xhsBrowserView.webContents)
  })
  ipcMain.handle('autologin:login', async (_event, shopId: string) => {
    if (!xhsBrowserView) return false
    const ok = await autoLoginService.tryAutoLoginIfNeeded(shopId, xhsBrowserView.webContents, XHS_LOGIN_URL)
    if (ok) {
      await xhsBrowserView.webContents.loadURL(XHS_DASHBOARD_URL)
      await shopContextService.initializePhase2(shopId)
    }
    return ok
  })
  ipcMain.handle('autologin:clear', async () => { await autoLoginService.clearCookies(); return true })
  ipcMain.handle('autologin:refresh-ticket', async () => {
    if (!xhsBrowserView) return false
    return autoLoginService.refreshServiceTicket(xhsBrowserView.webContents)
  })
  ipcMain.handle('autologin:save-main-login', (_event, shopId: string, email: string, password: string) => {
    storageService.saveMainLoginInfo(shopId, email, password)
    return true
  })
  ipcMain.handle('autologin:get-main-login', (_event, shopId: string) => {
    const info = storageService.getMainLoginInfo(shopId)
    return info ? { email: info.email, hasPassword: !!info.password } : null
  })

  ipcMain.handle('subaccount:add', (_event, account) => {
    storageService.addSubAccount(account)
    return true
  })
  ipcMain.handle('subaccount:list', (_event, shopId: string) => storageService.getSubAccounts(shopId))
  ipcMain.handle('subaccount:login', async (_event, id: number) => {
    if (!xhsBrowserView) return false
    const ok = await autoLoginService.loginWithSubAccount(id, xhsBrowserView.webContents, XHS_LOGIN_URL)
    if (ok) await xhsBrowserView.webContents.loadURL(XHS_DASHBOARD_URL)
    return ok
  })

  ipcMain.handle('mock:toggle', (_event, enabled: boolean) => {
    mockService.setEnabled(enabled)
    return mockService.isEnabled()
  })
  ipcMain.handle('mock:status', () => mockService.isEnabled())
  ipcMain.handle('crash:status', () => crashRecoveryService.getStatus())

  ipcMain.handle('product:add-binding', (_event, binding) => {
    const id = storageService.addProductBinding(binding)
    void psyCloudService.syncBindingsFromLocal(currentShopId())
    return id
  })
  ipcMain.handle('product:get-binding', (_event, shopId: string, productId: string) =>
    storageService.getProductBinding(shopId, productId))
  ipcMain.handle('product:list-bindings', (_event, shopId: string) =>
    storageService.getAllProductBindings(shopId))
  ipcMain.handle('product:update-binding', (_event, id: number, updates) => {
    const ok = storageService.updateProductBinding(id, updates)
    void psyCloudService.syncBindingsFromLocal(currentShopId())
    return ok
  })
  ipcMain.handle('product:delete-binding', (_event, id: number) => storageService.deleteProductBinding(id))
  ipcMain.handle('product:add-cards', (_event, bindingId: number, cards: string[], options) =>
    storageService.addCardPool(bindingId, cards, options))
  ipcMain.handle('product:card-stats', (_event, bindingId: number) =>
    storageService.getCardPoolStats(bindingId))
  ipcMain.handle('product:card-list', (_event, bindingId: number, status?: string, limit?: number, offset?: number) =>
    storageService.getCardPoolList(bindingId, status, limit, offset))

  ipcMain.handle('psy:status', () => psyCloudService.getStatus())
  ipcMain.handle('psy:set-config', (_event, opts: { baseUrl?: string; token?: string; username?: string }) => {
    psyCloudService.setConfig(opts || {})
    return true
  })
  ipcMain.handle('psy:clear-auth', () => {
    psyCloudService.clearAuth()
    return true
  })
  ipcMain.handle('psy:login', async (_event, username: string, password: string) =>
    psyCloudService.login(username, password))
  ipcMain.handle('psy:ensure-integration-token', async () => psyCloudService.ensureIntegrationToken())
  ipcMain.handle('psy:open-login-window', async () => {
    if (psyLoginWindow && !psyLoginWindow.isDestroyed()) {
      psyLoginWindow.show()
      psyLoginWindow.focus()
      return true
    }
    psyLoginWindow = new BrowserWindow({
      width: 420,
      height: 520,
      resizable: false,
      maximizable: false,
      minimizable: true,
      title: '心象测对接登录',
      parent: mainWindow || undefined,
      modal: !!mainWindow,
      show: false,
      autoHideMenuBar: true,
      webPreferences: {
        preload: join(__dirname, 'psy-login-preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false
      }
    })
    psyLoginWindow.on('closed', () => {
      psyLoginWindow = null
    })
    await psyLoginWindow.loadFile(join(__dirname, '../resources/psy-login.html'))
    psyLoginWindow.show()
    psyLoginWindow.focus()
    return true
  })
  ipcMain.handle('psy:login-window', async (_event, payload: { baseUrl?: string; username: string; password: string }) => {
    if (payload?.baseUrl) psyCloudService.setConfig({ baseUrl: payload.baseUrl })
    const res = await psyCloudService.login(payload?.username || '', payload?.password || '')
    if (res.success && res.token && !String(res.token).startsWith('xxpsy_')) {
      // 旧云端只返回会话 JWT 时，再拉一次长久对接 token
      await psyCloudService.ensureIntegrationToken()
    }
    if (res.success) {
      mainWindow?.webContents.send('psy-auth-updated', psyCloudService.getStatus())
      void psyCloudService.syncBindingsFromLocal(currentShopId())
    }
    return res
  })
  ipcMain.handle('psy:close-login-window', () => {
    if (psyLoginWindow && !psyLoginWindow.isDestroyed()) psyLoginWindow.close()
    return true
  })
  ipcMain.handle('psy:list-tests', async () => psyCloudService.listTests())
  ipcMain.handle('psy:inventory', async (_event, testCode: string) => psyCloudService.inventory(testCode))
  ipcMain.handle(
    'psy:claim-into-pool',
    async (_event, bindingId: number, testCode: string, count: number, productId?: string) =>
      psyCloudService.claimIntoPool(bindingId, testCode, count, productId)
  )
  ipcMain.handle('psy:release-batch', async (_event, batchId: string) => psyCloudService.releaseBatch(batchId))
  ipcMain.handle('psy:sync-bindings', async () => psyCloudService.syncBindingsFromLocal(currentShopId()))
  ipcMain.handle('psy:order-claim-url', () => psyCloudService.getOrderClaimUrl())

  // 订单发卡管理（对标阿奇锁 OrderImMsgController）
  ipcMain.handle('order:deliveries', (_event, filter) => storageService.getOrderDeliveriesList(filter || {}))
  ipcMain.handle('order:delivery-detail', (_event, orderId: string) => storageService.getOrderDeliveries(orderId))
  ipcMain.handle('order:delivery-resend', async (_event, orderId: string) => {
    const items = storageService.getOrderDeliveries(orderId)
    if (!items || items.length === 0) return { success: false, message: '发货消息不存在' }
    if (items.some((it: any) => it.send_status === 'disabled')) return { success: false, message: '消息已作废，无法重发' }
    const retried = await autoShipService.retryFailedDeliveries()
    return { success: true, retried }
  })
  ipcMain.handle('order:delivery-disable', (_event, orderId: string) => {
    const changed = storageService.disableOrderDelivery(orderId)
    return { success: changed, message: changed ? '作废成功' : '发货消息不存在' }
  })
  ipcMain.handle('order:retry-failed', async () => autoShipService.retryFailedDeliveries())

  // 同步千帆后台商品列表（对标阿奇锁 getGoodsNoteList）
  ipcMain.handle('goods:sync', async () => autoShipService.syncGoodsList())
  ipcMain.handle('goods:open-ark', () => autoShipService.openArkMerchantWindow())
  ipcMain.handle('goods:get-cached', (_event, shopId?: string) =>
    storageService.getSyncedGoods(shopId || 'default'))
  ipcMain.handle('goods:clear-cached', (_event, shopId?: string) => {
    storageService.saveSyncedGoods(shopId || 'default', [])
    return true
  })

  ipcMain.handle('reply:list', (_event, shopId: string) => storageService.getReplyRules(shopId, true))
  ipcMain.handle('reply:add', (_event, rule) => {
    storageService.addReplyRule(rule)
    return true
  })
  ipcMain.handle('reply:update', (_event, id: number, updates) => storageService.updateReplyRule(id, updates))
  ipcMain.handle('reply:delete', (_event, id: number) => storageService.deleteReplyRule(id))

  ipcMain.handle('reship:get-config', (_event, shopId: string) => storageService.getReshipConfig(shopId))
  ipcMain.handle('reship:set-config', (_event, shopId: string, config) => {
    storageService.saveReshipConfig(shopId, config)
    autoReshipService.startMonitoring()
    return true
  })

  ipcMain.handle('shop:list', () => ({
    currentId: currentShopId(),
    shops: storageService.listShops(),
    limit: licenseService.getShopLimit()
  }))
  ipcMain.handle('shop:add', async () => addShopAccount())
  ipcMain.handle('shop:switch', async (_event, shopId: string) => {
    const ok = await switchToShop(String(shopId || DEFAULT_SHOP_ID))
    const view = shopViews.get(currentShopId())
    if (view) {
      const url = view.webContents.getURL()
      if (!url || url === 'about:blank') {
        const injected = await autoLoginService.loadAndInjectCookies(currentShopId())
        await view.webContents.loadURL(injected ? XHS_DASHBOARD_URL : XHS_LOGIN_URL)
      }
    }
    mainWindow?.webContents.send('navigate', '/browser')
    return ok
  })
  ipcMain.handle('shop:logout', async () => logoutCurrentShop())
  ipcMain.handle('shop:init-phase2', async (_event, shopId: string, shopName?: string) => {
    await shopContextService.initializePhase2(shopId, shopName)
    return true
  })

  ipcMain.handle('kefu:open', () => { createKefuWindow(); return true })

  ipcMain.handle('autoship:processed-count', () => autoShipService.getProcessedCount())
  ipcMain.handle('autoship:start', (_event, intervalMs?: number) => {
    autoShipService.startPolling(intervalMs && intervalMs > 0 ? intervalMs : undefined)
    return true
  })
  ipcMain.handle('autoship:stop', () => { autoShipService.stopPolling(); return true })
  ipcMain.handle('autoship:manual-trigger', async (_event, order) => {
    await autoShipService.handleNewOrder(order)
    return true
  })

  ipcMain.handle('shiplog:list', (_event, shopId: string, limit?: number) =>
    storageService.getShipLogs(shopId, limit || 100))

  // 401 / ServiceTicket / 订单 / 客服消息桥接
  ipcMain.on('xhs-401-redirect', (_event, data) => {
    logger.warn(`[XhsRedirectOn401] 401 检测: ${data?.url}`)
    handle401Redirect(data?.url)
  })

  ipcMain.on('xhs-csa-info', async (_event, data) => {
    if (!xhsBrowserView || !autoLoginService) return
    const shopId = (global as any).currentShopId || 'default'
    const pageUrl = xhsBrowserView.webContents.getURL()
    if (!data?.success && (
      pageUrl.includes('/cstools/login') ||
      pageUrl.includes('customer.xiaohongshu.com') ||
      pageUrl.includes('/login')
    )) {
      return
    }
    logger.info(`[KefuAutoLogin] HandleServiceTicketResponseAsync success=${!!data?.success}`)
    if (data?.success) {
      autoLoginService.markCsaSuccess()
    }
    // 先从 API 体抠 token；auth===access 时 apply 会拒绝，避免污染
    if (data?.data) {
      const tok = autoLoginService.extractAuthFromPayload(data.data)
      if (tok.authToken && tok.accessToken && tok.authToken !== tok.accessToken) {
        await autoLoginService.applyEvaAuthTokens(tok)
      }
    }
    await autoLoginService.handleServiceTicketFromPage(
      xhsBrowserView.webContents,
      shopId,
      !!data?.success
    )
    if (data?.success) {
      if (xhsBrowserView) {
        await autoLoginService.syncEvaAuthCookies(xhsBrowserView.webContents)
        await autoLoginService.saveCookies(shopId, xhsBrowserView.webContents)
        // 禁止强制 loadURL 跳 chat：会打断 dashboard 并冲掉已渲染会话列表
      }
      await shopContextService?.initializePhase2(shopId)
      wsService?.reconnectKefu()
    } else if (await autoLoginService.hasSsoSessionCookies()) {
      // 业务 get_csa 失败但 SSO Cookie 在：仍补 Phase2，绝不踢登录
      await autoLoginService.syncEvaAuthCookies(xhsBrowserView.webContents)
      await shopContextService?.initializePhase2(shopId)
    }
  })

  ipcMain.on('xhs-login-user', async (_event, data) => {
    logger.info('[Login] 收到登录用户信息')
    if (autoLoginService) {
      const tok = autoLoginService.extractAuthFromPayload(data?.data ?? data)
      if (tok.authToken || tok.accessToken) {
        await autoLoginService.applyEvaAuthTokens(tok)
        if (xhsBrowserView) {
          await autoLoginService.syncEvaAuthCookies(xhsBrowserView.webContents)
        }
        const shopId = (global as any).currentShopId || 'default'
        await shopContextService?.initializePhase2(shopId)
        wsService?.reconnectKefu()
      } else if (xhsBrowserView) {
        await autoLoginService.syncEvaAuthCookies(xhsBrowserView.webContents)
      }
    }
    if (data?.data) {
      mainWindow?.webContents.send('login-user', data.data)
    }
  })

  ipcMain.on('xhs-new-order', async (event, data) => {
    if (data?.orderId || data?.order_id) {
      const shopId = shopIdFromWebContents(event.sender) || currentShopId()
      await autoShipService.handleNewOrder({
        order_id: data.orderId || data.order_id,
        product_id: data.productId || data.product_id || '',
        status: data.status || '待发货',
        source: data.source || 'inject',
        shop_id: shopId
      })
    }
  })

  ipcMain.on('xhs-kefu-message', (_event, data) => {
    logger.info(`[Kefu] 新消息: ${data?.content}`)
    mainWindow?.webContents.send('kefu:new-message', data)
  })
}

// ==================== 应用生命周期 ====================
app.whenReady().then(async () => {
  try {
    await initialize()
  } catch (err) {
    if (err instanceof Error && err.message === 'SINGLE_INSTANCE_QUIT') return
    try {
      const { appendFileSync, mkdirSync, existsSync } = require('fs')
      const { join } = require('path')
      const logDir = join(app.getPath('userData'), 'Logs')
      if (!existsSync(logDir)) mkdirSync(logDir, { recursive: true })
      appendFileSync(join(logDir, 'uncaught.log'), `[init] ${err}\n`)
    } catch { /* ignore */ }
    app.quit()
    return
  }

  setupIPC()
  createMainWindow()
  createTray(mainWindow!, logger, { openKefu: createKefuWindow })
})

app.on('window-all-closed', () => {})

app.on('before-quit', () => {
  (app as any).isQuitting = true
  destroyAllShopImWindows()
  wsService?.stop()
  apiService?.stop()
  autoShipService?.dispose()
  autoReshipService?.dispose()
  logger.info('程序退出')
})

app.on('activate', () => {
  if (mainWindow) mainWindow.show()
  else createMainWindow()
})
