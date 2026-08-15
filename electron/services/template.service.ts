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

/** 自助领链接（仅作参考；IM 话术默认不再带此项，可在发货内容里自行编辑） */
export const PSY_ORDER_CLAIM_URL = 'https://psy.xhs365.cn/order-claim'

/**
 * 测评链接卡默认三轮话术（可编辑，非写死发货）
 * 1) 测试链接 {卡密}
 * 2) 使用方法
 * 3) 引导上滑
 */
export const LINK_CARD_DEFAULT_DELIVER_CONTENT = [
  '{卡密}',
  [
    '使用方法一：直接在红薯上点击打开并测试',
    '使用方法二：',
    '1.复制您的专属链接到手机浏览器',
    '2.长按浏览器地址栏（长条输入框，苹果Safari是在最底部）',
    '3.点击粘贴打开前进，不要使用搜索方式，会进入错误网站~',
    '该链接可在三天内重复测三次，开始测试后72小时之后将失效，请及时测试并截图保存结果~有问题滴滴客服哈~'
  ].join('\n'),
  '宝，链接在上面哈，具体往上滑动屏幕可以看到~'
].join('\n\n')

/** @deprecated 兼容旧引用名 */
export const LINK_CARD_FIXED_DELIVER_CONTENT = LINK_CARD_DEFAULT_DELIVER_CONTENT

/** 随机短码（剔除易混淆字符 I/O/0/1） */
export function genUid(len: number = 10): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let s = ''
  for (let i = 0; i < len; i++) s += chars[Math.floor(Math.random() * chars.length)]
  return s
}

/** 渲染单条内容，替换所有占位符 */
export function renderTemplate(content: string, ctx: TemplateContext): string {
  const card = String(ctx.card || '').trim()
  const uid = card || genUid(ctx.uidLength ?? 10)
  const ts = Date.now().toString()
  return String(content)
    .replace(/\{(订单号|order_id)\}/g, ctx.orderId)
    .replace(/\{(买家昵称|buyer_name)\}/g, ctx.buyerName || '')
    .replace(/\{(商品名|product_name)\}/g, ctx.productName || '')
    .replace(/\{(卡密|card)\}/g, card)
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
  // 链接卡：用绑定表可编辑话术；空则回落默认三轮
  let raw =
    type === 'link_card'
      ? String(binding.deliver_content || '').trim() || LINK_CARD_DEFAULT_DELIVER_CONTENT
      : binding.deliver_content || ''

  // 链接卡密兜底：确保含 {卡密}
  if (type === 'link_card') {
    if (!needsCard(raw)) raw = '{卡密}\n\n' + raw.trim()
  }

  switch (type) {
    case 'card':
    case 'link_card':
    case 'text':
    case 'link': {
      if (!splitMulti) return [{ type: 'text', rawContent: raw }]
      const parts = splitMultiRound(raw, binding.msg_separator)
      return parts.length > 0
        ? parts.map((p) => ({ type: 'text' as const, rawContent: p }))
        : [{ type: 'text', rawContent: raw }]
    }
    case 'image':
      return [{ type: 'image', rawContent: raw }]
    case 'video':
      return [{ type: 'video', rawContent: raw }]
    case 'note':
      return [{ type: 'note', rawContent: raw }]
    case 'mixed': {
      try {
        const arr = JSON.parse(raw)
        if (!Array.isArray(arr)) throw new Error('mixed 内容非数组')
        return arr
          .map((item: any) => ({
            type: (item.type || 'text') as MessageType,
            rawContent: String(item.content ?? item.rawContent ?? '')
          }))
          .filter((m: { rawContent: string }) => m.rawContent.length > 0)
      } catch {
        return [{ type: 'text', rawContent: raw }]
      }
    }
    case 'manual':
      return null
    default:
      return [{ type: 'text', rawContent: raw }]
  }
}
