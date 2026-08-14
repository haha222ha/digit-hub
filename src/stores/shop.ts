import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

export interface ShopInfo {
  id: string
  name: string
  sellerId?: string
}

export const useShopStore = defineStore('shop', () => {
  const currentShop = ref<ShopInfo | null>(null)
  const shops = ref<ShopInfo[]>([])
  const limit = ref(5)

  const currentId = computed(() => currentShop.value?.id || 'default')

  function applyPayload(data: { currentId?: string; shops?: ShopInfo[]; limit?: number }) {
    shops.value = data.shops || []
    if (typeof data.limit === 'number') limit.value = data.limit
    const id = data.currentId || shops.value[0]?.id || 'default'
    currentShop.value = shops.value.find((s) => s.id === id) || { id, name: id === 'default' ? '默认店铺' : id }
  }

  async function refresh() {
    if (!window.electronAPI?.listShops) return
    const data = await window.electronAPI.listShops()
    applyPayload(data)
  }

  async function addShop() {
    if (!window.electronAPI?.addShop) return { success: false, message: '接口未就绪' }
    const res = await window.electronAPI.addShop()
    await refresh()
    return res
  }

  async function switchShop(shopId: string) {
    await window.electronAPI?.switchShop(shopId)
    await refresh()
  }

  async function logoutShop() {
    await window.electronAPI?.logoutShop()
    await refresh()
  }

  return {
    currentShop,
    shops,
    limit,
    currentId,
    applyPayload,
    refresh,
    addShop,
    switchShop,
    logoutShop
  }
})
