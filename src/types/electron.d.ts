export interface WsStatusDetail {
  status: 'Closed' | 'Connecting' | 'Open'
  reconnectAttempts: number
  url: string
  main: { status: string; reconnectAttempts: number; url: string }
  kefu: { status: string; reconnectAttempts: number; url: string }
}

export interface ElectronAPI {
  getDeviceCode(): Promise<string>
  getDeviceInfo(): Promise<{
    cpuId: string
    boardSerial: string
    diskSerial: string
    macAddress: string
  }>

  checkLicense(): Promise<boolean>
  activateLicense(key: string): Promise<{
    success: boolean
    message: string
    licenseInfo?: LicenseInfo
  }>
  getLicenseStatus(): Promise<LicenseInfo>
  getLicenseEdition(): Promise<'trial' | 'basic' | 'pro' | 'enterprise'>
  hasLicenseFeature(feature: string): Promise<boolean>
  getShopLimit(): Promise<number>

  minimizeWindow(): Promise<void>
  maximizeWindow(): Promise<void>
  closeWindow(): Promise<void>
  isMaximized(): Promise<boolean>

  getConfig(key: string): Promise<unknown>
  setConfig(key: string, value: unknown): Promise<boolean>
  getAllConfig(): Promise<Record<string, unknown>>

  getLogs(lines: number): Promise<string[]>
  getWsStatus(): Promise<WsStatusDetail>
  reconnectWs(): Promise<boolean>

  checkUpdate(): Promise<boolean>
  downloadUpdate(): Promise<boolean>
  installUpdate(): Promise<void>

  checkLoginStatus(): Promise<boolean>
  saveCookies(shopId: string): Promise<boolean>
  autoLogin(shopId: string): Promise<boolean>
  clearCookies(): Promise<boolean>
  refreshServiceTicket(): Promise<boolean>
  saveMainLogin(shopId: string, email: string, password: string): Promise<boolean>
  getMainLogin(shopId: string): Promise<{ email: string; hasPassword: boolean } | null>

  addSubAccount(account: {
    shopId: string
    subAccountId?: string
    username: string
    password: string
  }): Promise<boolean>
  getSubAccounts(shopId: string): Promise<SubAccount[]>
  loginSubAccount(id: number): Promise<boolean>

  toggleMock(enabled: boolean): Promise<boolean>
  getMockStatus(): Promise<boolean>
  getCrashStatus(): Promise<{ crashRetryCount: number; maxRetry: number; lastReloadTime: number }>

  addProductBinding(binding: ProductBindingInput): Promise<number>
  getProductBinding(shopId: string, productId: string): Promise<ProductBinding | null>
  listProductBindings(shopId: string): Promise<ProductBinding[]>
  updateProductBinding(id: number, updates: Record<string, unknown>): Promise<boolean>
  deleteProductBinding(id: number): Promise<boolean>
  addCards(bindingId: number, cards: string[], options?: { skipDuplicate?: boolean }): Promise<number>
  getCardStats(bindingId: number): Promise<{ total: number; unused: number; used: number; locked: number }>
  getCardList(bindingId: number, status?: string, limit?: number, offset?: number): Promise<CardPoolItem[]>

  // 订单发卡管理
  getOrderDeliveries(filter: { shopId?: string; status?: string; limit?: number; offset?: number }): Promise<{ items: OrderDelivery[]; total: number }>
  getOrderDeliveryDetail(orderId: string): Promise<OrderDelivery[]>
  resendOrderDelivery(orderId: string): Promise<{ success: boolean; retried?: number; message?: string }>
  disableOrderDelivery(orderId: string): Promise<{ success: boolean; message?: string }>
  retryFailedDeliveries(): Promise<number>

  // 商品同步
  syncGoodsList(): Promise<{ success: boolean; goods: Array<{ itemId: string; title: string; noteId?: string; price?: string; stock?: string; image?: string }>; error?: string }>

  getAutoShipProcessedCount(): Promise<number>
  startAutoShip(intervalMs?: number): Promise<boolean>
  stopAutoShip(): Promise<boolean>
  manualTriggerShip(order: Record<string, unknown>): Promise<boolean>
  getShipLogs(shopId: string, limit?: number): Promise<ShipLog[]>

  listReplyRules(shopId: string): Promise<ReplyRule[]>
  addReplyRule(rule: { shopId: string; keyword: string; replyText: string; replyType?: string }): Promise<boolean>
  updateReplyRule(id: number, updates: Record<string, unknown>): Promise<boolean>
  deleteReplyRule(id: number): Promise<boolean>

  getReshipConfig(shopId: string): Promise<{ enabled: boolean; retryIntervalMs: number } | null>
  setReshipConfig(shopId: string, config: { enabled: boolean; retryIntervalMs?: number }): Promise<boolean>

  initShopPhase2(shopId: string, shopName?: string): Promise<boolean>
  openKefuWindow(): Promise<boolean>

  browserLoad(url: string): Promise<boolean>
  browserGoBack(): Promise<boolean>
  browserGoForward(): Promise<boolean>
  browserReload(): Promise<boolean>
  browserGetUrl(): Promise<string>
  browserCanGoBack(): Promise<boolean>
  browserCanGoForward(): Promise<boolean>
  browserShow(): Promise<boolean>
  browserHide(): Promise<boolean>
  browserRoute(path: string): Promise<boolean>
  browserSetBounds(bounds: { x: number; y: number; width: number; height: number }): Promise<boolean>
  onBrowserUrlChange(callback: (url: string) => void): void
  onBrowserLoading(callback: (loading: boolean) => void): void

  onWsStatusChange(callback: (status: string) => void): void
  onWsStatusDetail(callback: (detail: WsStatusDetail) => void): void
  onLicenseExpired(callback: () => void): void
  onUpdateAvailable(callback: (info: unknown) => void): void
  onLoginRequired(callback: (data: unknown) => void): void
  onNavigate(callback: (path: string) => void): void
  onKefuMessage(callback: (data: unknown) => void): void
}

export interface LicenseInfo {
  deviceCode: string
  licenseKey: string
  activatedAt: string
  expiresAt: string | null
  status: 'active' | 'expired' | 'trial' | 'unactivated'
  trialDaysLeft: number
  edition: 'trial' | 'basic' | 'pro' | 'enterprise'
  features: string[]
}

export interface SubAccount {
  id: number
  shop_id: string
  sub_account_id: string
  username: string
  last_login_at: number
  status: string
}

export interface ProductBindingInput {
  shopId: string
  productId: string
  productName?: string
  productType?: 'virtual' | 'physical'
  deliverType?: 'card' | 'text' | 'link' | 'note' | 'image' | 'video' | 'mixed' | 'manual'
  deliverContent: string
  stock?: number
  randomMode?: boolean
  lowStockAlert?: number
  sendIntervalMs?: number
  uidLength?: number
  msgSeparator?: string
}

export interface ProductBinding {
  id: number
  shop_id: string
  product_id: string
  product_name: string
  product_type: string
  deliver_type: string
  deliver_content: string
  stock: number
  delivered_count?: number
  enabled: boolean
  random_mode?: number
  low_stock_alert?: number
  send_interval_ms?: number
  uid_length?: number
  msg_separator?: string
}

export interface CardPoolItem {
  id: number
  binding_id: number
  card_content: string
  status: 'unused' | 'locked' | 'used'
  order_id: string | null
  used_at: string | null
  locked_at: string | null
  created_at: string
}

export interface OrderDelivery {
  id: number
  shop_id: string
  order_id: string
  product_id: string
  binding_id: number | null
  buyer_uid: string | null
  msg_guid: string
  msg_index: number
  msg_total: number
  send_status: 'pending' | 'sending' | 'success' | 'fail' | 'disabled'
  retry_count: number
  card_content: string | null
  error_msg: string | null
  created_at: string
  updated_at: string
}

export interface ShipLog {
  id: number
  shop_id: string
  order_id: string
  tracking_number: string
  status: string
  error_msg: string
  created_at: string
}

export interface ReplyRule {
  id: number
  shop_id: string
  keyword: string
  reply_text: string
  reply_type: string
  enabled: number
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI
  }
}

export {}
