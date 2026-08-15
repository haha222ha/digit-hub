import { WebContents } from 'electron'
import { StorageService } from './storage.service'
import { LoggerService } from './logger.service'
import { AutoShipService } from './autoship.service'
import { currentShopId } from '../utils/shop-partition'

/**
 * 售后补发监测（DOM）——与「台账补单」「自动补货」分离
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

  /** 根据配置启动售后补发监测（不含台账补单） */
  startMonitoring() {
    const shopId = currentShopId() || (global as any).currentShopId || 'default'
    const config = this.storage.getReshipConfig(shopId)
    if (config?.aftersaleEnabled || config?.enabled) {
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
    }, intervalMs)
    this.logger.info(`[AutoReship] 启动售后补发监测，间隔: ${intervalMs}ms`)
  }

  stopPolling() {
    if (this.pollInterval) {
      clearInterval(this.pollInterval)
      this.pollInterval = null
    }
  }

  private async pollReshipOrders(): Promise<void> {
    if (!this.monitorWebContents) return
    const shopId = currentShopId() || (global as any).currentShopId || 'default'
    const config = this.storage.getReshipConfig(shopId)
    if (!(config?.aftersaleEnabled || config?.enabled)) return

    const url = this.monitorWebContents.getURL()
    if (!url.includes('walle.xiaohongshu.com') && !url.includes('ark.xiaohongshu.com')) return

    try {
      const orders = await this.monitorWebContents
        .executeJavaScript(
          `
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
      `
        )
        .catch(() => [])

      if (Array.isArray(orders)) {
        for (const order of orders) {
          await this.handleReshipOrder(order)
        }
      }
    } catch {
      // 静默
    }
  }

  async handleReshipOrder(order: {
    order_id: string
    product_id?: string
    status?: string
  }): Promise<void> {
    if (!order?.order_id) return
    const key = `reship_${order.order_id}`
    if (this.processedReships.has(key)) return

    this.logger.info(`[AutoReship] 检测到售后补发单: ${order.order_id}`)
    this.processedReships.add(key)

    await this.autoShip.handleNewOrder({
      order_id: order.order_id,
      product_id: order.product_id,
      status: '待发货',
      source: 'reship',
      forceReship: true
    })
  }

  dispose() {
    this.stopPolling()
    this.processedReships.clear()
    this.monitorWebContents = null
  }
}
