import { defineStore } from 'pinia'
import { ref } from 'vue'

export interface ShopInfo {
  id: string
  name: string
  avatar?: string
}

export const useShopStore = defineStore('shop', () => {
  const currentShop = ref<ShopInfo | null>(null)
  const shops = ref<ShopInfo[]>([])

  function setCurrentShop(shop: ShopInfo) {
    currentShop.value = shop
  }

  function addShop(shop: ShopInfo) {
    if (!shops.value.find((s) => s.id === shop.id)) {
      shops.value.push(shop)
    }
  }

  return { currentShop, shops, setCurrentShop, addShop }
})