/**
 * 模板渲染服务（对标阿奇锁 ConvertToXhsSendImMsg + 占位符替换）
 * - 纯函数，无副作用
 * - 支持占位符：{订单号}/{order_id} {买家昵称}/{buyer_name} {商品名}/{product_name}
 *               {卡密}/{card} {店铺名}/{shop_name} {uid} {ts}
 * - 支持多轮对话：按分隔符拆分多条消息（对标阿奇锁 ImMsgs 数组）
 */

export interface TemplateContext {
  orderId: string
  buyerName?: string
  productName?: string
  card?: string
  shopName?: string
  uidLength?: number
}

/** 测评类商品写死的自助领链接（千帆发货栏 / IM 备用入口） */
export const PSY_ORDER_CLAIM_URL = 'https://psy.xhs365.cn/order-claim'

/**
 * 测评链接卡（link_card）自动发货内容 — 写死三轮：
 * 1) 专属测试链接 {卡密}
 * 2) 自助领链接 order-claim
 * 3) 引导去客服窗查看已发链接的说明
 */
export const LINK_CARD_FIXED_DELIVER_CONTENT = [
  '{卡密}',
  PSY_ORDER_CLAIM_URL,
  '该链接需要输入您的订单号，上方链接提取繁琐，请直接进入店铺客服聊天窗口，客服已经把测试链接发给您了，方便您直接测试，聊天窗口位于商品页面左下角客服按钮，或订单详情下方的联系卖家 ，如果您已经在客服聊天窗口，可以直接往下查看测试链接'
].join('\n\n')

/** 随机短码（剔除易混淆字符 I/O/0/1） */
export function genUid(len: number = 10): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let s = ''
  for (let i = 0; i < len; i++) s += chars[Math.floor(Math.random() * chars.length)]
  return s
}

/** 渲染单条内容，替换所有占位符 */
export function renderTemplate(content: string, ctx: TemplateContext): string {
  const uid = ctx.card ?? genUid(ctx.uidLength ?? 10)
  const ts = Date.now().toString()
  return String(content)
    .replace(/\{(订单号|order_id)\}/g, ctx.orderId)
    .replace(/\{(买家昵称|buyer_name)\}/g, ctx.buyerName || '')
    .replace(/\{(商品名|product_name)\}/g, ctx.productName || '')
    .replace(/\{(卡密|card)\}/g, ctx.card || '')
    .replace(/\{(店铺名|shop_name)\}/g, ctx.shopName || '')
    .replace(/\{uid\}/g, uid)
    .replace(/\{ts\}/g, ts)
}

/**
 * 按分隔符拆分多条消息（多轮对话，对标阿奇锁 ImMsgs 数组）
 * - 优先用自定义分隔符，否则默认按双换行 \n\n
 * - 拆分后 trim 并过滤空片段
 */
export function splitMultiRound(content: string, separator?: string): string[] {
  const sep = separator && separator.trim() ? separator : '\n\n'
  return String(content)
    .split(sep)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

/**
 * 检查内容是否含 {card} 占位符（决定是否需消耗卡密）
 */
export function needsCard(content: string): boolean {
  return /\{(卡密|card)\}/.test(content)
}

/**
 * 构建消息列表（对标 buildMessages）
 * 根据 deliver_type 决定消息结构，统一输出为：
 *   { type: 'text'|'image'|'video', rawContent: string }[]
 *
 * @returns 消息列表；manual 类型返回 null（需人工）
 */
export type MessageType = 'text' | 'image' | 'video' | 'note'

export function buildMessages(
  binding: { deliver_type: string; deliver_content: string; msg_separator?: string },
  splitMulti: boolean = true
): { type: MessageType; rawContent: string }[] | null {
  const type = binding.deliver_type
  // 测评类链接卡：发货内容写死（专属链接 + order-claim + 客服引导）
  let raw =
    type === 'link_card' ? LINK_CARD_FIXED_DELIVER_CONTENT : binding.deliver_content || ''

  // 链接卡密兜底：确保含 {卡密}
  if (type === 'link_card') {
    if (!needsCard(raw)) raw = raw.trim() + '\n\n{卡密}'
  }

  switch (type) {
    case 'card':
    case 'link_card':
    case 'text':
    case 'link': {
      // 纯文本类型：支持多轮拆分（若内容含分隔符则拆多条）
      if (!splitMulti) return [{ type: 'text', rawContent: raw }]
      const parts = splitMultiRound(raw, binding.msg_separator)
      return parts.length > 0 ? parts.map((p) => ({ type: 'text' as const, rawContent: p })) : [{ type: 'text', rawContent: raw }]
    }
    case 'image':
      return [{ type: 'image', rawContent: raw }]
    case 'video':
      return [{ type: 'video', rawContent: raw }]
    case 'note':
      // 网址发货凭证（对标阿奇锁 sendCustomNotesMsg content_type:92）
      return [{ type: 'note', rawContent: raw }]
    case 'mixed': {
      // JSON 数组多段（图文混排），每段 { type, content }
      try {
        const arr = JSON.parse(raw)
        if (!Array.isArray(arr)) throw new Error('mixed 内容非数组')
        return arr
          .filter((seg: any) => seg && seg.content)
          .map((seg: any) => ({ type: (seg.type === 'image' ? 'image' : seg.type === 'video' ? 'video' : seg.type === 'note' ? 'note' : 'text') as MessageType, rawContent: String(seg.content) }))
      } catch {
        // 解析失败优雅降级为单段文本
        return [{ type: 'text', rawContent: raw }]
      }
    }
    case 'manual':
      return null
    default:
      // 未知类型降级为文本
      return [{ type: 'text', rawContent: raw }]
  }
}
