<template>
  <div class="app-container">
    <!-- 自定义标题栏 -->
    <TitleBar />

    <!-- 主内容区 -->
    <div class="main-content">
      <SideMenu />
      <div class="content-area">
        <router-view />
      </div>
    </div>

    <!-- 状态栏 -->
    <StatusBar />
  </div>
</template>

<script setup lang="ts">
import { onMounted, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import TitleBar from './components/TitleBar.vue'
import SideMenu from './components/SideMenu.vue'
import StatusBar from './components/StatusBar.vue'
import { useLicenseStore } from './stores/license'

const router = useRouter()
const route = useRoute()
const licenseStore = useLicenseStore()

function syncBrowserViewVisibility(path: string) {
  window.electronAPI?.browserRoute(path)
}

onMounted(async () => {
  await licenseStore.checkStatus()

  if (!licenseStore.isValid) {
    router.push('/license')
  }

  syncBrowserViewVisibility(route.path)

  if (window.electronAPI) {
    window.electronAPI.onLicenseExpired(() => {
      licenseStore.checkStatus()
      router.push('/license')
    })

    window.electronAPI.onNavigate((path: string) => {
      router.push(path)
    })

    window.electronAPI.onLoginRequired(() => {
      router.push('/browser')
    })
  }
})

watch(
  () => route.path,
  (path) => syncBrowserViewVisibility(path)
)
</script>

<style scoped>
.app-container {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
}

.main-content {
  flex: 1;
  overflow: hidden;
  display: flex;
}

.content-area {
  flex: 1;
  overflow: hidden;
}
</style>