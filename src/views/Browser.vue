<template>
  <div class="browser-view">
    <div class="browser-toolbar">
      <el-button @click="goBack" :disabled="!canGoBack" size="small">
        <el-icon><ArrowLeft /></el-icon>
      </el-button>
      <el-button @click="goForward" :disabled="!canGoForward" size="small">
        <el-icon><ArrowRight /></el-icon>
      </el-button>
      <el-button @click="reload" size="small">
        <el-icon><Refresh /></el-icon>
      </el-button>
      <el-input
        v-model="url"
        placeholder="输入网址或直接打开小红书后台"
        @keyup.enter="navigate"
        class="url-input"
        size="small"
      />
      <el-button type="primary" @click="navigate" size="small">前往</el-button>
      <el-button @click="goToXhs" size="small">客服工作台</el-button>
      <el-button @click="goToLogin" size="small">客服登录页</el-button>
      <el-button type="success" @click="triggerAutoLogin" size="small">自动登录</el-button>
      <el-button @click="saveLogin" size="small">保存登录</el-button>
      <el-tag v-if="loading" type="info" size="small">加载中...</el-tag>
    </div>

    <div class="browser-placeholder" v-if="!hasLoaded">
      <el-empty description="正在加载小红书客服工作台...">
        <el-button type="primary" @click="goToXhs">重新加载</el-button>
      </el-empty>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { ArrowLeft, ArrowRight, Refresh } from '@element-plus/icons-vue'
import { XHS_DASHBOARD_URL, XHS_LOGIN_URL } from '@/constants/xhs-urls'

const SHOP_ID = 'default'

const url = ref('')
const canGoBack = ref(false)
const canGoForward = ref(false)
const loading = ref(false)
const hasLoaded = ref(false)

const goToXhs = async () => {
  await loadUrl(XHS_DASHBOARD_URL)
}

const goToLogin = async () => {
  await loadUrl(XHS_LOGIN_URL)
}

const triggerAutoLogin = async () => {
  loading.value = true
  try {
    const ok = await window.electronAPI?.autoLogin(SHOP_ID)
    if (ok) {
      ElMessage.success('自动登录成功')
      hasLoaded.value = true
      url.value = await window.electronAPI!.browserGetUrl()
    } else {
      ElMessage.warning('自动登录未完成：请用客服邮箱登录 cstools/login，或手动登录后点「保存登录」')
      await goToLogin()
    }
  } finally {
    loading.value = false
  }
}

const navigate = async () => {
  if (!url.value.trim()) {
    ElMessage.warning('请输入网址')
    return
  }
  await loadUrl(url.value)
}

const loadUrl = async (targetUrl: string) => {
  if (!window.electronAPI?.browserLoad) {
    ElMessage.error('BrowserView API 不可用')
    return
  }
  loading.value = true
  await window.electronAPI.browserLoad(targetUrl)
  await window.electronAPI.browserShow()
  hasLoaded.value = true
  url.value = targetUrl
  loading.value = false
  await updateNavState()
}

const saveLogin = async () => {
  if (!window.electronAPI) return
  const ok = await window.electronAPI.saveCookies(SHOP_ID)
  if (ok) {
    await window.electronAPI.initShopPhase2(SHOP_ID)
    ElMessage.success('登录态已保存，Phase 2 初始化完成')
  } else {
    ElMessage.error('保存失败')
  }
}

const goBack = async () => {
  await window.electronAPI?.browserGoBack()
  await updateNavState()
}

const goForward = async () => {
  await window.electronAPI?.browserGoForward()
  await updateNavState()
}

const reload = async () => {
  await window.electronAPI?.browserReload()
}

const updateNavState = async () => {
  if (!window.electronAPI) return
  canGoBack.value = await window.electronAPI.browserCanGoBack()
  canGoForward.value = await window.electronAPI.browserCanGoForward()
  url.value = await window.electronAPI.browserGetUrl()
}

const onUrlChanged = (newUrl: string) => {
  url.value = newUrl
  hasLoaded.value = true
  updateNavState()
}

const onLoadingChanged = (isLoading: boolean) => {
  loading.value = isLoading
  if (!isLoading) updateNavState()
}

onMounted(async () => {
  if (window.electronAPI) {
    window.electronAPI.onBrowserUrlChange(onUrlChanged)
    window.electronAPI.onBrowserLoading(onLoadingChanged)
    // 若主进程已加载则同步状态，否则主动加载
    const current = await window.electronAPI.browserGetUrl()
    if (current && current.includes('xiaohongshu.com')) {
      hasLoaded.value = true
      url.value = current
      await window.electronAPI.browserShow()
    } else {
      // 主进程启动时已打开 cstools/login；此处只同步显示 BrowserView
      await window.electronAPI.browserShow()
      hasLoaded.value = true
    }
  }
})
</script>

<style scoped>
.browser-view {
  height: 100%;
  display: flex;
  flex-direction: column;
  position: relative;
}

.browser-toolbar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  background: #f5f7fa;
  border-bottom: 1px solid #e4e7ed;
  z-index: 10;
}

.url-input {
  flex: 1;
}

.browser-placeholder {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
