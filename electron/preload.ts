import { contextBridge, ipcRenderer } from 'electron'

// 桥接页面注入脚本的 postMessage → IPC
window.addEventListener('message', (event) => {
  if (event.source !== window) return
  const data = event.data
  if (!data?.type) return

  switch (data.type) {
    case 'xhs-401-redirect':
      ipcRenderer.send('xhs-401-redirect', data)
      break
    case 'xhs-csa-info':
      ipcRenderer.send('xhs-csa-info', data)
      break
    case 'xhs-login-user':
      ipcRenderer.send('xhs-login-user', data)
      break
    case 'xhs-new-order':
      ipcRenderer.send('xhs-new-order', data)
      break
    case 'xhs-kefu-message':
    case 'kefu-new-message':
      ipcRenderer.send('xhs-kefu-message', data)
      break
    case 'kefu-cookie-expired': {
      const href = window.location.href
      if (/\/login|cstools\/login|customer\.xiaohongshu\.com/.test(href)) break
      ipcRenderer.send('xhs-401-redirect', { url: data.url || href, reason: 'cookie_expired' })
      break
    }
  }
})

contextBridge.exposeInMainWorld('electronAPI', {
  getDeviceCode: () => ipcRenderer.invoke('device:get-code'),
  getDeviceInfo: () => ipcRenderer.invoke('device:get-info'),

  checkLicense: () => ipcRenderer.invoke('license:check'),
  activateLicense: (key: string) => ipcRenderer.invoke('license:activate', key),
  getLicenseStatus: () => ipcRenderer.invoke('license:status'),
  getLicenseEdition: () => ipcRenderer.invoke('license:edition'),
  hasLicenseFeature: (feature: string) => ipcRenderer.invoke('license:has-feature', feature),
  getShopLimit: () => ipcRenderer.invoke('license:shop-limit'),

  minimizeWindow: () => ipcRenderer.invoke('window:minimize'),
  maximizeWindow: () => ipcRenderer.invoke('window:maximize'),
  closeWindow: () => ipcRenderer.invoke('window:close'),
  isMaximized: () => ipcRenderer.invoke('window:is-maximized'),

  getConfig: (key: string) => ipcRenderer.invoke('config:get', key),
  setConfig: (key: string, value: unknown) => ipcRenderer.invoke('config:set', key, value),
  getAllConfig: () => ipcRenderer.invoke('config:getAll'),

  getLogs: (lines: number) => ipcRenderer.invoke('log:get', lines),
  getWsStatus: () => ipcRenderer.invoke('ws:status'),
  reconnectWs: () => ipcRenderer.invoke('ws:reconnect'),

  checkUpdate: () => ipcRenderer.invoke('update:check'),
  downloadUpdate: () => ipcRenderer.invoke('update:download'),
  installUpdate: () => ipcRenderer.invoke('update:install'),

  checkLoginStatus: () => ipcRenderer.invoke('autologin:check'),
  saveCookies: (shopId: string) => ipcRenderer.invoke('autologin:save-cookies', shopId),
  autoLogin: (shopId: string) => ipcRenderer.invoke('autologin:login', shopId),
  clearCookies: () => ipcRenderer.invoke('autologin:clear'),
  refreshServiceTicket: () => ipcRenderer.invoke('autologin:refresh-ticket'),
  saveMainLogin: (shopId: string, email: string, password: string) =>
    ipcRenderer.invoke('autologin:save-main-login', shopId, email, password),
  getMainLogin: (shopId: string) => ipcRenderer.invoke('autologin:get-main-login', shopId),

  addSubAccount: (account: { shopId: string; subAccountId?: string; username: string; password: string }) =>
    ipcRenderer.invoke('subaccount:add', account),
  getSubAccounts: (shopId: string) => ipcRenderer.invoke('subaccount:list', shopId),
  loginSubAccount: (id: number) => ipcRenderer.invoke('subaccount:login', id),

  toggleMock: (enabled: boolean) => ipcRenderer.invoke('mock:toggle', enabled),
  getMockStatus: () => ipcRenderer.invoke('mock:status'),
  getCrashStatus: () => ipcRenderer.invoke('crash:status'),

  addProductBinding: (binding: {
    shopId?: string
    productId: string
    productName?: string
    productType?: 'virtual' | 'physical'
    deliverType?: 'card' | 'link_card' | 'text' | 'link' | 'note' | 'image' | 'video' | 'mixed' | 'manual'
    deliverContent: string
    stock?: number
    randomMode?: boolean
    lowStockAlert?: number
    sendIntervalMs?: number
    uidLength?: number
    msgSeparator?: string
    psyTestCode?: string
    poolKey?: string
  }) => ipcRenderer.invoke('product:add-binding', binding),
  getProductBinding: (shopId: string, productId: string) =>
    ipcRenderer.invoke('product:get-binding', shopId, productId),
  listProductBindings: (shopId?: string) => ipcRenderer.invoke('product:list-bindings', shopId),
  listSharedPools: () => ipcRenderer.invoke('product:list-shared-pools'),
  updateProductBinding: (id: number, updates: Record<string, unknown>) =>
    ipcRenderer.invoke('product:update-binding', id, updates),
  deleteProductBinding: (id: number) => ipcRenderer.invoke('product:delete-binding', id),
  clearAllProductBindings: () => ipcRenderer.invoke('product:clear-all-bindings'),
  addCards: (bindingId: number, cards: string[], options?: { skipDuplicate?: boolean }) =>
    ipcRenderer.invoke('product:add-cards', bindingId, cards, options),
  getCardStats: (bindingId: number) => ipcRenderer.invoke('product:card-stats', bindingId),
  getCardList: (bindingId: number, status?: string, limit?: number, offset?: number) =>
    ipcRenderer.invoke('product:card-list', bindingId, status, limit, offset),

  psyStatus: () => ipcRenderer.invoke('psy:status'),
  psySetConfig: (opts: { baseUrl?: string; token?: string; username?: string }) =>
    ipcRenderer.invoke('psy:set-config', opts),
  psyClearAuth: () => ipcRenderer.invoke('psy:clear-auth'),
  psyLogin: (username: string, password: string) => ipcRenderer.invoke('psy:login', username, password),
  psyOpenLoginWindow: () => ipcRenderer.invoke('psy:open-login-window'),
  psyEnsureIntegrationToken: () => ipcRenderer.invoke('psy:ensure-integration-token'),
  psyListTests: () => ipcRenderer.invoke('psy:list-tests'),
  psyInventory: (testCode: string) => ipcRenderer.invoke('psy:inventory', testCode),
  psyQuotaInfo: () => ipcRenderer.invoke('psy:quota-info'),
  psyClaimIntoPool: (bindingId: number, testCode: string, count: number, productId?: string) =>
    ipcRenderer.invoke('psy:claim-into-pool', bindingId, testCode, count, productId),
  psyGenerateLinks: (testCode: string, count: number) =>
    ipcRenderer.invoke('psy:generate-links', testCode, count),
  psyAutoReplenishNow: (bindingId: number) => ipcRenderer.invoke('psy:auto-replenish-now', bindingId),
  onPsyAutoReplenish: (callback: (evt: any) => void) => {
    const handler = (_event: any, data: any) => callback(data)
    ipcRenderer.on('psy:auto-replenish', handler)
    return () => ipcRenderer.removeListener('psy:auto-replenish', handler)
  },
  psyReleaseBatch: (batchId: string) => ipcRenderer.invoke('psy:release-batch', batchId),
  psySyncBindings: () => ipcRenderer.invoke('psy:sync-bindings'),
  psyOrderClaimUrl: () => ipcRenderer.invoke('psy:order-claim-url'),
  onPsyAuthUpdated: (callback: (status: any) => void) => {
    const handler = (_event: any, data: any) => callback(data)
    ipcRenderer.on('psy-auth-updated', handler)
    return () => ipcRenderer.removeListener('psy-auth-updated', handler)
  },

  // 订单发卡管理
  getOrderDeliveries: (filter: { shopId?: string; status?: string; limit?: number; offset?: number }) =>
    ipcRenderer.invoke('order:deliveries', filter),
  getOrderDeliveryDetail: (orderId: string) => ipcRenderer.invoke('order:delivery-detail', orderId),
  resendOrderDelivery: (orderId: string) => ipcRenderer.invoke('order:delivery-resend', orderId),
  disableOrderDelivery: (orderId: string) => ipcRenderer.invoke('order:delivery-disable', orderId),
  retryFailedDeliveries: () => ipcRenderer.invoke('order:retry-failed'),

  // 商品同步
  syncGoodsList: () => ipcRenderer.invoke('goods:sync'),
  openArkMerchant: () => ipcRenderer.invoke('goods:open-ark'),
  getCachedGoods: (shopId?: string) => ipcRenderer.invoke('goods:get-cached', shopId),
  clearCachedGoods: (shopId?: string) => ipcRenderer.invoke('goods:clear-cached', shopId),
  onGoodsSyncResult: (callback: (result: { success: boolean; goods: any[]; error?: string }) => void) => {
    const handler = (_event: any, result: any) => callback(result)
    ipcRenderer.on('goods:sync-result', handler)
    return () => ipcRenderer.removeListener('goods:sync-result', handler)
  },

  getAutoShipProcessedCount: () => ipcRenderer.invoke('autoship:processed-count'),
  startAutoShip: (intervalMs?: number) => ipcRenderer.invoke('autoship:start', intervalMs),
  stopAutoShip: () => ipcRenderer.invoke('autoship:stop'),
  manualTriggerShip: (order: Record<string, unknown>) => ipcRenderer.invoke('autoship:manual-trigger', order),
  getShipLogs: (shopId: string, limit?: number) => ipcRenderer.invoke('shiplog:list', shopId, limit),
  exportShipLogs: () => ipcRenderer.invoke('shiplog:export'),
  getSystemStats: () => ipcRenderer.invoke('system:stats'),

  listReplyRules: (shopId: string) => ipcRenderer.invoke('reply:list', shopId),
  addReplyRule: (rule: { shopId: string; keyword: string; replyText: string; replyType?: string }) =>
    ipcRenderer.invoke('reply:add', rule),
  updateReplyRule: (id: number, updates: Record<string, unknown>) => ipcRenderer.invoke('reply:update', id, updates),
  deleteReplyRule: (id: number) => ipcRenderer.invoke('reply:delete', id),

  getReshipConfig: (shopId: string) => ipcRenderer.invoke('reship:get-config', shopId),
  setReshipConfig: (shopId: string, config: { enabled: boolean; retryIntervalMs?: number }) =>
    ipcRenderer.invoke('reship:set-config', shopId, config),

  initShopPhase2: (shopId: string, shopName?: string) => ipcRenderer.invoke('shop:init-phase2', shopId, shopName),
  listShops: () => ipcRenderer.invoke('shop:list'),
  addShop: () => ipcRenderer.invoke('shop:add'),
  switchShop: (shopId: string) => ipcRenderer.invoke('shop:switch', shopId),
  logoutShop: () => ipcRenderer.invoke('shop:logout'),
  onShopChanged: (callback: (data: { currentId: string; shops: Array<{ id: string; name: string }> }) => void) => {
    const handler = (_event: any, data: any) => callback(data)
    ipcRenderer.on('shop:changed', handler)
    return () => ipcRenderer.removeListener('shop:changed', handler)
  },
  openKefuWindow: () => ipcRenderer.invoke('kefu:open'),

  browserLoad: (url: string) => ipcRenderer.invoke('browser:load', url),
  browserGoBack: () => ipcRenderer.invoke('browser:go-back'),
  browserGoForward: () => ipcRenderer.invoke('browser:go-forward'),
  browserReload: () => ipcRenderer.invoke('browser:reload'),
  browserGetUrl: () => ipcRenderer.invoke('browser:get-url'),
  browserCanGoBack: () => ipcRenderer.invoke('browser:can-go-back'),
  browserCanGoForward: () => ipcRenderer.invoke('browser:can-go-forward'),
  browserShow: () => ipcRenderer.invoke('browser:show'),
  browserHide: () => ipcRenderer.invoke('browser:hide'),
  browserOpenLoginAssist: () => ipcRenderer.invoke('browser:open-login-assist'),
  browserFocus: () => ipcRenderer.invoke('browser:focus'),
  browserRoute: (path: string) => ipcRenderer.invoke('browser:route', path),
  browserSetBounds: (bounds: { x: number; y: number; width: number; height: number }) =>
    ipcRenderer.invoke('browser:set-bounds', bounds),
  onBrowserUrlChange: (callback: (url: string) => void) => {
    ipcRenderer.on('browser:url-changed', (_event, url) => callback(url))
  },
  onBrowserLoading: (callback: (loading: boolean) => void) => {
    ipcRenderer.on('browser:loading', (_event, loading) => callback(loading))
  },

  onWsStatusChange: (callback: (status: string) => void) => {
    ipcRenderer.on('ws:status-changed', (_event, status) => callback(status))
  },
  onWsStatusDetail: (callback: (detail: unknown) => void) => {
    ipcRenderer.on('ws:status-detail', (_event, detail) => callback(detail))
  },
  onLicenseExpired: (callback: () => void) => {
    ipcRenderer.on('license:expired', () => callback())
  },
  onUpdateAvailable: (callback: (info: unknown) => void) => {
    ipcRenderer.on('update:available', (_event, info) => callback(info))
  },
  onLoginRequired: (callback: (data: unknown) => void) => {
    ipcRenderer.on('login-required', (_event, data) => callback(data))
  },
  onNavigate: (callback: (path: string) => void) => {
    ipcRenderer.on('navigate', (_event, path) => callback(path))
  },
  onKefuMessage: (callback: (data: unknown) => void) => {
    ipcRenderer.on('kefu:new-message', (_event, data) => callback(data))
  },

  // ==================== 阿奇索1:1兼容通道 ====================
  // 云端验证占位（已移除云端依赖）
  onKillOnlineUser: (callback: () => void) => { ipcRenderer.on('on:killOnlineUser', () => callback()) },
  onSyncDisableMsg: (callback: (data: unknown) => void) => { ipcRenderer.on('on:syncDisableMsg', (_e, data) => callback(data)) },
  onAldsLoginSuccess: (callback: (data: unknown) => void) => { ipcRenderer.on('on:aldsLoginSuccess', (_e, data) => callback(data)) },
  onAldsSetToken: (callback: (data: unknown) => void) => { ipcRenderer.on('on:aldsSetToken', (_e, data) => callback(data)) },
  onReLoginAlds: () => ipcRenderer.send('on:reLoginAlds'),
  onXhsAldsLoaded: () => ipcRenderer.send('on:xhsAldsLoaded'),
  disableAldsMsg: () => ipcRenderer.invoke('on:disableAldsMsg'),
  getAldsLogList: () => ipcRenderer.invoke('on:getAldsLogList'),
  getXhsAldsAuthCodeUrl: () => ipcRenderer.invoke('on:getXhsAldsAuthCodeUrl'),
  receivedAldsMsg: () => ipcRenderer.invoke('on:receivedAldsMsg'),
  resendAlds: () => ipcRenderer.invoke('on:resendAlds'),

  // 窗口管理
  hideWindows: () => ipcRenderer.send('on:hideWindows'),
  showMainWin: () => ipcRenderer.send('on:showMainWin'),
  logout: () => ipcRenderer.send('on:logout'),
  openCurrentWinDevTools: () => ipcRenderer.send('on:openCurrentWinDevTools'),
  openExternalUrl: (url: string) => ipcRenderer.send('on:openExternalUrl', url),
  onLoginTimeoutNotice: (callback: () => void) => { ipcRenderer.on('on:loginTimeoutNotice', () => callback()) },
  onTokenExpired: (callback: () => void) => { ipcRenderer.on('on:tokenExpired', () => callback()) },
  setLoginEmailAndPassword: (email: string, password: string) => ipcRenderer.send('on:setLoginEmailAndPassword', email, password),
  wsLog: (msg: string) => ipcRenderer.send('on:wsLog', msg),
  showMsg: (title: string, body: string) => ipcRenderer.send('showMsg', title, body),
  setSharedData: (key: string, value: unknown) => ipcRenderer.send('setSharedData', key, value),
  updateEndpoint: (endpoint: string) => ipcRenderer.send('store:updateEndpoint', endpoint),
  newAccount: () => ipcRenderer.send('newAccount'),
  installNewVersion: () => ipcRenderer.send('installNewVersion'),

  // 系统/版本信息
  getAutoOpen: () => ipcRenderer.invoke('autoLogin:getAutoOpen'),
  setAutoOpen: (val: boolean) => ipcRenderer.invoke('autoLogin:setAutoOpen', val),
  getAppVersionInfo: () => ipcRenderer.invoke('getAppVersionInfo'),
  getGlobalStore: () => ipcRenderer.invoke('getGlobalStore'),
  getSystemData: () => ipcRenderer.invoke('getSystemData'),
  createMainWindow: () => ipcRenderer.invoke('on:createMainWindow'),
  deleteXhsUserLocal: (shopId: string) => ipcRenderer.invoke('on:deleteXhsUserLocal', shopId),
  getXhsUserLocal: (shopId: string) => ipcRenderer.invoke('on:getXhsUserLocal', shopId),
  getXhsUserLocalList: () => ipcRenderer.invoke('on:getXhsUserLocalList'),
  getMemory: () => ipcRenderer.invoke('on:memory'),
  updateAppConfigJson: (config: Record<string, unknown>) => ipcRenderer.invoke('on:updateAppConfigJson', config),

  // ipcRenderer 透传（原版 preload 直接暴露 ipcRenderer）
  ipcRenderer: {
    send: (channel: string, ...args: unknown[]) => ipcRenderer.send(channel, ...args),
    invoke: (channel: string, ...args: unknown[]) => ipcRenderer.invoke(channel, ...args),
    on: (channel: string, callback: (...args: unknown[]) => void) => {
      const handler = (_event: unknown, ...args: unknown[]) => callback(...args)
      ipcRenderer.on(channel, handler)
      return () => ipcRenderer.removeListener(channel, handler)
    },
    removeAllListeners: (channel: string) => ipcRenderer.removeAllListeners(channel)
  }
})
