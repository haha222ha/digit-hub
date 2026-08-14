/** 首店沿用 persist:main，保证现有已登录 Cookie 不丢。新店 persist:shop:{id} */
export const DEFAULT_SHOP_ID = 'default'

export function currentShopId(): string {
  const id = String((global as any).currentShopId || DEFAULT_SHOP_ID).trim()
  return id || DEFAULT_SHOP_ID
}

export function partitionForShop(shopId?: string | null): string {
  const id = String(shopId || currentShopId()).trim() || DEFAULT_SHOP_ID
  if (id === DEFAULT_SHOP_ID) return 'persist:main'
  return `persist:shop:${id}`
}

export function newShopId(): string {
  return `shop_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`
}
