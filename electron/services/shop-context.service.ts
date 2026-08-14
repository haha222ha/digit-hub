import { LoggerService } from './logger.service'
import { StorageService } from './storage.service'
import { WebSocketService } from './websocket.service'
import { AutoShipService } from './autoship.service'
import { AutoReshipService } from './autoreship.service'
import { MockService } from './mock.service'

/**
 * 店铺上下文 — 对标原版 LoginHandler Phase 2 + XhsShopContext
 */
export class ShopContextService {
  private logger: LoggerService
  private storage: StorageService
  private ws: WebSocketService
  private autoShip: AutoShipService
  private autoReship: AutoReshipService
  private mock: MockService
  private initializedShops: Set<string> = new Set()
  private ensureImSession: ((shopId: string) => Promise<boolean>) | null = null

  constructor(
    logger: LoggerService,
    storage: StorageService,
    ws: WebSocketService,
    autoShip: AutoShipService,
    autoReship: AutoReshipService,
    mock: MockService
  ) {
    this.logger = logger
    this.storage = storage
    this.ws = ws
    this.autoShip = autoShip
    this.autoReship = autoReship
    this.mock = mock
  }

  setEnsureImSession(fn: (shopId: string) => Promise<boolean>) {
    this.ensureImSession = fn
  }

  async initializePhase2(shopId: string, shopName?: string): Promise<void> {
    if (this.initializedShops.has(shopId)) {
      this.logger.info(`[XhsShopContext] 店铺已初始化: ${shopId}，仍尝试重连 zelda`)
      this.ws.reconnectKefu()
      void this.ensureImSession?.(shopId)
      return
    }

    this.logger.info(`[LoginHandler] 开始 Phase 2 初始化 ShopId=${shopId}`)
    ;(global as any).currentShopId = shopId

    const existing = this.storage.getShopConfig(shopId)
    this.storage.saveShopConfig(shopId, {
      shopName: shopName || existing?.shop_name || `店铺 ${shopId.slice(-6)}`,
      autoShipEnabled: existing?.autoShipEnabled ?? true,
      autoReplyEnabled: existing?.autoReplyEnabled ?? false
    })

    this.logger.info('[AutoShipConfig] 配置已从数据库加载')
    this.logger.info('[AutoShipReshipConfig] 配置已从数据库加载')
    this.logger.info('[AutoReplyConfig] 配置已从数据库加载')

    const autoShipEnabled = this.storage.get<boolean>('autoShipEnabled')
    if (autoShipEnabled !== false) {
      // orderPollInterval 单位秒，默认 30 秒（内部接口，避免风控/限流）
      this.autoShip.startPolling(
        (this.storage.get<number>('orderPollInterval') || 15) * 1000
      )
    }

    const reshipConfig = this.storage.getReshipConfig(shopId) || { enabled: false, retryIntervalMs: 10000 }
    if (reshipConfig.enabled) {
      this.autoReship.startPolling(reshipConfig.retryIntervalMs || 10000)
    }

    if (this.mock.isEnabled()) {
      this.logger.info('[XhsShopContext] Mock 模式已启用')
    }

    this.ws.reconnectKefu()
    this.initializedShops.add(shopId)
    void this.ensureImSession?.(shopId)
    this.logger.info(`[XhsShopContext] 初始化完成 ShopId=${shopId}`)
    this.logger.info('[Login] 登录成功')
  }
}
