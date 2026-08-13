<template>
  <div class="title-bar">
    <div class="title-left">
      <img src="../assets/favicon.svg" alt="logo" class="logo" />
      <span class="title">小红书发货助手</span>
    </div>

    <div class="title-center">
      <span class="shop-name" v-if="shopStore.currentShop">
        {{ shopStore.currentShop.name }}
      </span>
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
import { useShopStore } from '../stores/shop'

const shopStore = useShopStore()

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
  text-align: center;
}

.shop-name {
  font-size: 12px;
  color: #909399;
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