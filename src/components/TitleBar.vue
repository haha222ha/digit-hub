<template>
  <div class="title-bar">
    <div class="title-left">
      <img src="../assets/favicon.svg" alt="logo" class="logo" />
      <span class="title">小红书发货助手</span>
    </div>

    <div class="title-center">
      <div class="shop-switch" v-if="shopStore.shops.length">
        <select class="shop-select" :value="shopStore.currentId" @change="onShopChange">
          <option v-for="s in shopStore.shops" :key="s.id" :value="s.id">{{ s.name || s.id }}</option>
        </select>
        <button class="shop-btn" type="button" @click="onAddShop">添加店铺</button>
        <button class="shop-btn" type="button" @click="onLogout">退出当前</button>
      </div>
    </div>

    <div class="title-right">
      <button class="title-btn" @click="handleMinimize" title="最小化">
        <svg width="12" height="12" viewBox="0 0 12 12">
          <rect x="2" y="5.5" width="8" height="1" fill="currentColor" />
        </svg>
      </button>
      <button class="title-btn" @click="handleMaximize" title="最大化">
        <svg width="12" height="12" viewBox="0 0 12 12">
          <rect x="2.5" y="2.5" width="7" height="7" fill="none" stroke="currentColor" />
        </svg>
      </button>
      <button class="title-btn close" @click="handleClose" title="关闭">
        <svg width="12" height="12" viewBox="0 0 12 12">
          <path d="M2 2 L10 10 M10 2 L2 10" stroke="currentColor" stroke-width="1" />
        </svg>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useShopStore } from '../stores/shop'

const shopStore = useShopStore()

onMounted(() => {
  void shopStore.refresh()
})

const onShopChange = async (e: Event) => {
  const id = (e.target as HTMLSelectElement).value
  if (id && id !== shopStore.currentId) await shopStore.switchShop(id)
}

const onAddShop = async () => {
  const res = await shopStore.addShop()
  if (!res.success) {
    ElMessage.warning(res.message || '无法添加店铺')
    return
  }
  ElMessage.success('已新建店铺，请用该店客服账号登录（Cookie 与发卡互不串店）')
}

const onLogout = async () => {
  try {
    await ElMessageBox.confirm('退出后需重新登录该店铺，卡密绑定仍留在本店。', '退出当前店铺', { type: 'warning' })
  } catch {
    return
  }
  await shopStore.logoutShop()
  ElMessage.success('已退出当前店铺')
}

const handleMinimize = () => {
  window.electronAPI?.minimizeWindow()
}

const handleMaximize = async () => {
  await window.electronAPI?.maximizeWindow()
}

const handleClose = () => {
  window.electronAPI?.closeWindow()
}
</script>

<style scoped>
.title-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 36px;
  background: #fff;
  border-bottom: 1px solid #e4e7ed;
  -webkit-app-region: drag;
  padding: 0 12px;
}

.title-left {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
  -webkit-app-region: drag;
}

.logo {
  width: 20px;
  height: 20px;
}

.title {
  font-size: 13px;
  font-weight: 500;
  color: #303133;
}

.title-center {
  flex: 1;
  display: flex;
  justify-content: center;
  height: 100%;
  -webkit-app-region: drag;
}

.shop-switch {
  display: flex;
  align-items: center;
  gap: 8px;
  -webkit-app-region: no-drag;
}

.shop-select {
  max-width: 180px;
  height: 24px;
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  font-size: 12px;
  color: #303133;
  padding: 0 6px;
}

.shop-btn {
  height: 24px;
  padding: 0 8px;
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  background: #fff;
  font-size: 12px;
  cursor: pointer;
  color: #606266;
}

.shop-btn:hover {
  color: #409eff;
  border-color: #c6e2ff;
}

.title-right {
  display: flex;
  align-items: center;
  gap: 4px;
  -webkit-app-region: no-drag;
}

.title-btn {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  cursor: pointer;
  color: #606266;
  border-radius: 4px;
  transition: background 0.2s;
}

.title-btn:hover {
  background: #f0f2f5;
}

.title-btn.close:hover {
  background: #f56c6c;
  color: #fff;
}
</style>