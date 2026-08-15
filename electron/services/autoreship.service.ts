import { WebContents } from 'electron'
import { StorageService } from './storage.service'
import { LoggerService } from './logger.service'
import { AutoShipService } from './autoship.service'

/**
 * 自动补发服务（对标原版 AutoShipReshipConfig）
 * 监控补发/售后单并触发重新发货
 */
export class AutoReshipService {
  private storage: StorageService
  private logger: LoggerService
  private autoShip: AutoShipService
  private monitorWebContents: WebContents | null = null
  private pollInterval: NodeJS.Timeout | null = null
  private processedReships: Set<string> = new Set()

  constructor(storage: StorageService, logger: LoggerService, autoShip: AutoShipService) {
    this.storage = storage
    this.logger = logger
    this.autoShip = autoShip
  }

  bindWebContents(wc: WebContents) {
    this.monitorWebContents = wc
    this.logger.info('[AutoReship] 已绑定监测 WebContents')
  }

  /** 根据配置启动补发监测 */
  startMonitoring() {
    const shopId = (global as any).currentShopId || 'default'
    const config = this.storage.getReshipConfig(shopId)
    if (config?.enabled) {
      this.startPolling(config.retryIntervalMs || 10000)
    } else {
      this.stopPolling()
    }
  }

  startPolling(intervalMs = 10000) {
    this.stopPolling()
    this.pollInterval = setInterval(() => {
      this.pollReshipOrders().catch((err) => {
        this.logger.error('[AutoReship] 轮询失败:', err)
      })
      // 与「自动补发」开关联动：同步跑台账未发码对账（用户预期的补单）
      this.autoShip.reconcileUnshippedFromLedger(20).catch(() => undefined)
    }, intervalMs)
    this.logger.info(`[AutoReship] 启动补发/台账补单监测，间隔: ${intervalMs}ms`)
    void this.autoShip.reconcileUnshippedFromLedger(30).catch(() => undefined)
  }

  stopPolling() {
    if (this.pollInterval) {
      clearInterval(this.pollInterval)
      this.pollInterval = null
    }
  }

  private async pollReshipOrders(): Promise<void> {
    if (!this.monitorWebContents) return
    const shopId = (global as any).currentShopId || 'default'
    const config = this.storage.getReshipConfig(shopId)
    if (!config?.enabled) return

    const url = this.monitorWebContents.getURL()
    if (!url.includes('walle.xiaohongshu.com') && !url.includes('ark.xiaohongshu.com')) return

    try {
      const orders = await this.monitorWebContents.executeJavaScript(`
        (function() {
          const items = [];
          document.querySelectorAll('[class*="reship"], [class*="aftersale"], [class*="补发"]').forEach(function(el) {
            const idEl = el.querySelector('[class*="order-id"], [data-order-id]');
            const productEl = el.querySelector('[class*="product-id"], [data-product-id]');
            const statusEl = el.querySelector('[class*="status"]');
            if (idEl) {
              items.push({
                order_id: idEl.textContent || idEl.getAttribute('data-order-id') || '',
                product_id: productEl ? (productEl.textContent || productEl.getAttribute('data-product-id') || '') : '',
                status: statusEl ? statusEl.textContent : 'reship',
                source: 'reship_dom'
              });
            }
          });
          return items;
        })();
      `).catch(() => [])

      if (Array.isArray(orders)) {
        for (const order of orders) {
          await this.handleReshipOrder(order)
        }
      }
    } catch {
      // 静默
    }
  }

  async handleReshipOrder(order: { order_id: string; product_id?: string; status?: string }): Promise<void> {
    if (!order?.order_id) return
    const key = `reship_${order.order_id}`
    if (this.processedReships.has(key)) return

    this.logger.info(`[AutoReship] 检测到补发单: ${order.order_id}`)
    this.processedReships.add(key)

    await this.autoShip.handleNewOrder({
      order_id: order.order_id,
      product_id: order.product_id,
      status: '待发货',
      source: 'reship'
    })
  }

  dispose() {
    this.stopPolling()
    this.processedReships.clear()
    this.monitorWebContents = null
  }
}
