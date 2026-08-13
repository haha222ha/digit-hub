/**
 * 自动发货服务
 * - 对标阿奇锁：订单检测 → 商品绑定 → 卡密/文本 → XhsRim.sendTextMsg
 * - 订单源：fulfillment/order/page 轮询（不依赖阿奇云 WS）
 * - 发货：inject im-send.js → search_customer → getChatInfo → sendTextMsg
 */
import { WebContents } from 'electron'
import { StorageService } from './storage.service'
import { LoggerService } from './logger.service'
import { MockService } from './mock.service'
import {
  buildMessages,
  renderTemplate,
  needsCard,
  type TemplateContext
} from './template.service'
import { randomUUID } from 'crypto'

export class AutoShipService {
  private storage: StorageService
  private logger: LoggerService
  private mock: MockService
  private monitorInterval: NodeJS.Timeout | null = null
  private processedOrders: Set<string> = new Set()
  private isShipping = false
  private monitorWebContents: WebContents | null = null
  /** 优先用客服聊天页 WebContents（有 XhsRim） */
  private imWebContents: WebContents | null = null
  /** 轮询退避计数（失败时指数退避） */
  private pollBackoff = 0
  /** 默认轮询间隔：30 秒（内部接口，避免风控/限流） */
  private static readonly DEFAULT_POLL_INTERVAL = 30_000
  /** 退避上限：60 秒 */
  private static readonly MAX_POLL_BACKOFF = 60_000

  constructor(storage: StorageService, logger: LoggerService, mock: MockService) {
    this.storage = storage
    this.logger = logger
    this.mock = mock
  }

  bindWebContents(wc: WebContents) {
    this.monitorWebContents = wc
    this.logger.info('[AutoShip] 已绑定监测 WebContents')
    this.startPolling()
  }

  /** 绑定客服 IM 页（/cstools/chat），虚拟发货走这里 */
  bindImWebContents(wc: WebContents) {
    this.imWebContents = wc
    this.logger.info('[AutoShip] 已绑定 IM WebContents（虚拟发货通道）')
  }

  /** @deprecated 使用 bindWebContents */
  bindWindow(window: { webContents: WebContents }) {
    this.bindWebContents(window.webContents)
  }

  private getShipWc(): WebContents | null {
    const im = this.imWebContents
    if (im && !im.isDestroyed()) {
      const url = im.getURL()
      if (url.includes('walle.xiaohongshu.com')) return im
    }
    const mon = this.monitorWebContents
    if (mon && !mon.isDestroyed()) return mon
    return null
  }

  startPolling(intervalMs?: number) {
    this.stopPolling()
    // 默认 30 秒；配置值若 <5 秒则强制下限保护（避免内部接口风控）
    const base = intervalMs && intervalMs > 0 ? intervalMs : AutoShipService.DEFAULT_POLL_INTERVAL
    const safeBase = Math.max(base, 5000)

    const schedule = () => {
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
    if (this.isShipping) return
    const wc = this.getShipWc()
    if (!wc) return
    const url = wc.getURL()
    if (!url.includes('walle.xiaohongshu.com') && !url.includes('ark.xiaohongshu.com')) return

    try {
      const ready = await wc.executeJavaScript(`
        !!(window.__xhsAssistant && window.__xhsAssistant.im && window.__xhsAssistant.im.fetchPendingOrders)
      `).catch(() => false)
      if (!ready) return

      const orders = await wc.executeJavaScript(`
        window.__xhsAssistant.im.fetchPendingOrders().catch(function(e){ return { __error: String(e&&e.message||e) }; })
      `)

      if (orders && orders.__error) {
        this.logger.warn(`[AutoShip] fetchPendingOrders: ${orders.__error}`)
        // 失败退避：3s → 6s → 12s → 封顶 60s
        this.pollBackoff = Math.min((this.pollBackoff || 3000) * 2, AutoShipService.MAX_POLL_BACKOFF)
        return
      }
      if (!Array.isArray(orders)) return

      // 成功，重置退避
      this.pollBackoff = 0

      for (const order of orders) {
        await this.handleNewOrder(order)
      }
      this.cleanupProcessed()
    } catch {
      // 静默：页面可能尚未注入
    }
  }

  async handleNewOrder(order: {
    order_id: string
    product_id?: string
    buyer_info?: unknown
    status?: string
    order_time?: string
    source?: string
  }): Promise<void> {
    if (!order || !order.order_id) return

    // 不依赖千帆后台订单状态：唯一发货依据 = 该订单是否已在 order_delivery 发过卡密
    // （下方 existsOrderDelivery 持久化判重是唯一门槛）

    this.logger.info(
      `[AutoShip] 收到新订单: orderId=${order.order_id}, productId=${order.product_id || 'N/A'}, source=${order.source || '-'}`
    )

    let productId = order.product_id || ''
    if (!productId) {
      productId = (await this.resolveProductId(order.order_id)) || ''
    }
    if (!productId) {
      this.logger.warn(`[AutoShip] 订单缺少 product_id，跳过: ${order.order_id}`)
      return
    }
    order.product_id = productId

    const shopId = (global as any).currentShopId || 'default'

    // 幂等拦截：数据库唯一索引兜底（对标阿奇锁 GetByTidAsync + IdNo 唯一索引）
    // 无论内存 processedOrders 是否丢失（崩溃/重启），这里都能阻止重复发货
    if (this.storage.existsOrderDelivery(order.order_id)) {
      this.logger.info(`[AutoShip] 订单已处理过，跳过（持久化判重）: ${order.order_id}`)
      return
    }
    if (this.processedOrders.has(order.order_id)) {
      this.logger.info(`[AutoShip] 订单已处理过，跳过（内存判重）: ${order.order_id}`)
      return
    }

    this.isShipping = true
    try {
      const success = await this.processShipment(shopId, order)
      if (success) {
        this.processedOrders.add(order.order_id)
        this.logger.info(`[AutoShip] 订单发货成功: ${order.order_id}`)
      } else {
        this.logger.warn(`[AutoShip] 订单发货失败: ${order.order_id}`)
      }
    } catch (err) {
      this.logger.error(`[AutoShip] 订单发货异常: ${order.order_id}`, err)
    } finally {
      this.isShipping = false
    }
  }

  private async resolveProductId(orderId: string): Promise<string | null> {
    const wc = this.getShipWc()
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
    const binding = this.storage.getProductBinding(shopId, order.product_id)
    if (!binding) {
      this.logger.warn(`[AutoShip] 未找到商品绑定: productId=${order.product_id}`)
      this.storage.addShipLog({
        shopId,
        orderId: order.order_id,
        status: 'no_binding',
        errorMsg: `未绑定商品: ${order.product_id}`
      })
      return false
    }

    // ===== 绑定时间过滤：只处理「绑定商品之后」下单的订单（对标阿奇锁 FirstReply.CreateTime）=====
    if (order.order_time && binding.created_at) {
      const orderTs = this.parseTimeToTs(order.order_time)
      const bindingTs = this.parseTimeToTs(binding.created_at)
      if (orderTs !== null && bindingTs !== null && orderTs < bindingTs) {
        this.logger.info(
          `[AutoShip] 订单早于绑定时间，跳过（只处理绑定后订单）: order=${order.order_id}, orderTime=${order.order_time}, bindingTime=${binding.created_at}`
        )
        this.storage.addShipLog({
          shopId,
          orderId: order.order_id,
          status: 'before_binding',
          errorMsg: `订单下单时间(${order.order_time})早于绑定时间(${binding.created_at})`
        })
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
    let cardConsumed = false

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

      // 若本条含 {card}，锁定卡密（三段式第一步）
      const needCard = needsCard(msg.rawContent)
      if (needCard && !cardConsumed) {
        const card = this.storage.lockCard(binding.id, order.order_id, !!binding.random_mode)
        if (!card) {
          this.logger.error(`[AutoShip] 卡密池已空: bindingId=${binding.id}`)
          this.storage.updateDeliveryStatus(msgGuid, 'fail', { errorMsg: '卡密池已空' })
          this.storage.addShipLog({ shopId, orderId: order.order_id, status: 'out_of_stock', errorMsg: '卡密池已空' })
          return false
        }
        cardForOrder = card
        cardConsumed = true
      }

      // 渲染模板（占位符替换 + {uid}/{ts} 动态参数）
      const ctx: TemplateContext = {
        orderId: order.order_id,
        buyerName,
        productName: binding.product_name || '',
        card: cardForOrder ?? undefined,
        shopName: (global as any).currentShopName || '',
        uidLength: binding.uid_length ?? 10
      }
      const finalContent = renderTemplate(msg.rawContent, ctx)

      // 更新状态为 sending
      this.storage.updateDeliveryStatus(msgGuid, 'sending', {
        buyerUid,
        cardContent: cardForOrder ?? undefined
      })

      // Mock 模式：直接成功
      let shipResult: { success: boolean; trackingNumber?: string; buyerId?: string; error?: string }
      if (this.mock.isEnabled()) {
        this.logger.info(`[AutoShip][Mock] 模拟发货[${i + 1}/${msgTotal}]: ${finalContent.substring(0, 20)}...`)
        shipResult = { success: true, trackingNumber: finalContent.substring(0, 50) }
      } else {
        shipResult = await this.executeRealShip(order.order_id, finalContent, msg.type)
      }

      if (shipResult.success) {
        // 确认卡密（三段式第二步）
        if (cardConsumed) this.storage.confirmCard(order.order_id)
        // 回填真实买家 UID（对标阿奇锁 UpdateUidByTidAsync）：
        // 优先用 IM 层 search_customer 找到的 buyerId，订单 buyer_info 兜底
        const realBuyerUid = shipResult.buyerId || buyerUid || ''
        this.storage.updateDeliveryStatus(msgGuid, 'success', {
          buyerUid: realBuyerUid || undefined,
          cardContent: cardForOrder ?? undefined
        })
        this.storage.addShipLog({
          shopId,
          orderId: order.order_id,
          trackingNumber: shipResult.trackingNumber || finalContent.substring(0, 50),
          status: 'success'
        })
        this.logger.info(`[AutoShip] 消息发送成功 [${i + 1}/${msgTotal}]: ${order.order_id}`)
      } else {
        // 回滚卡密（三段式第三步）
        if (cardConsumed) {
          this.storage.rollbackCard(order.order_id)
          cardConsumed = false
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
   * 解析时间字符串为毫秒时间戳（支持多种格式），解析失败返回 null
   */
  private parseTimeToTs(timeStr: string): number | null {
    if (!timeStr) return null
    const s = String(timeStr).trim()
    if (!s) return null

    // 纯数字：可能是秒级或毫秒级时间戳
    if (/^\d+$/.test(s)) {
      const n = parseInt(s, 10)
      // 毫秒级（13 位）或秒级（10 位）
      if (n > 1e12) return n
      if (n > 1e9) return n * 1000
      return null
    }

    // 标准日期字符串（兼容 SQLite datetime('now') 的 "YYYY-MM-DD HH:MM:SS" 与 ISO）
    const normalized = s.replace(' ', 'T')
    const ts = Date.parse(normalized)
    return Number.isNaN(ts) ? null : ts
  }

  /**
   * 真实虚拟发货：IM 发消息给买家（对标阿奇锁 JsIMSend）
   */
  private async executeRealShip(
    orderId: string,
    content: string,
    type: 'text' | 'image' | 'video' | 'note' = 'text'
  ): Promise<{ success: boolean; trackingNumber?: string; buyerId?: string; error?: string }> {
    const wc = this.getShipWc()
    if (!wc) {
      return { success: false, error: '监测/IM WebContents 未绑定' }
    }

    const url = wc.getURL()
    if (!url.includes('walle.xiaohongshu.com')) {
      return { success: false, error: '当前不在小红书客服工作台页面' }
    }

    try {
      const bridgeOk = await wc.executeJavaScript(`
        (function(){
          if (!window.__xhsAssistant) window.__xhsAssistant = {};
          return !!(window.__xhsAssistant.im && window.__xhsAssistant.im.deliverByOrderSn);
        })()
      `)
      if (!bridgeOk) {
        return {
          success: false,
          error: 'IMSend 桥未注入：请打开 /cstools/chat 并等待页面加载完成'
        }
      }

      const hasRim = await wc.executeJavaScript(
        `window.__xhsAssistant.im.hasXhsRim && window.__xhsAssistant.im.hasXhsRim()`
      )
      if (!hasRim) {
        return {
          success: false,
          error: 'XhsRim 未就绪：请保持客服聊天页打开（/cstools/chat）'
        }
      }

      const result = await wc.executeJavaScript(`
        window.__xhsAssistant.im.deliverByOrderSn(
          ${JSON.stringify(orderId)},
          ${JSON.stringify(content)},
          ${JSON.stringify(type)}
        ).catch(function(e){
          return { success: false, error: String(e && e.message || e) };
        })
      `)

      if (result?.success) {
        this.logger.info(
          `[AutoShip] IM 发货成功: order=${orderId}, type=${type}, chatId=${result.chatId || '-'}, buyer=${result.buyerId || '-'}`
        )
        return {
          success: true,
          trackingNumber: result.trackingNumber || content.substring(0, 50),
          buyerId: result.buyerId || ''
        }
      }
      return { success: false, error: result?.error || 'IM 发货失败' }
    } catch (err: any) {
      return { success: false, error: err.message || String(err) }
    }
  }

  /**
   * 同步千帆后台商品列表（对标阿奇锁 getGoodsNoteList）
   * 通过 /api/edith/goods-note/list 拉取商品，供前端下拉选择绑定
   */
  async syncGoodsList(): Promise<{ success: boolean; goods: any[]; error?: string }> {
    const wc = this.monitorWebContents
    if (!wc || wc.isDestroyed()) {
      return { success: false, goods: [], error: '未绑定浏览器视图，请先登录千帆后台' }
    }
    try {
      const goods = await wc.executeJavaScript(`
        window.__xhsAssistant && window.__xhsAssistant.goods && window.__xhsAssistant.goods.fetchGoodsList
          ? window.__xhsAssistant.goods.fetchGoodsList().catch(function(e){ return { __error: String(e&&e.message||e) }; })
          : Promise.resolve({ __error: '商品同步脚本未注入，请在千帆后台页面刷新后重试' })
      `)
      if (goods && goods.__error) {
        return { success: false, goods: [], error: goods.__error }
      }
      if (!Array.isArray(goods)) {
        return { success: false, goods: [], error: '商品列表返回异常' }
      }
      this.logger.info(`[AutoShip] 同步商品列表成功: ${goods.length} 个商品`)
      return { success: true, goods }
    } catch (err: any) {
      return { success: false, goods: [], error: err.message || String(err) }
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

      const cardForOrder = item.card_content || null
      const content = item.card_content || (binding?.deliver_content ?? '')
      const type: 'text' | 'image' | 'video' | 'note' =
        binding?.deliver_type === 'image' ? 'image' :
        binding?.deliver_type === 'video' ? 'video' :
        binding?.deliver_type === 'note' ? 'note' : 'text'

      // 若本条含卡密，重新锁定一张（旧卡密已回滚）
      let cardConsumed = false
      if (needsCard(content)) {
        const card = this.storage.lockCard(item.binding_id, item.order_id, !!binding?.random_mode)
        if (!card) {
          this.storage.updateDeliveryStatus(item.msg_guid, 'fail', { errorMsg: '卡密池已空（重试）' })
          continue
        }
        cardConsumed = true
      }

      const shipResult = await this.executeRealShip(item.order_id, content, type)
      if (shipResult.success) {
        if (cardConsumed) this.storage.confirmCard(item.order_id)
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
  }
}
