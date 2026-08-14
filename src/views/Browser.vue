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

      <div class="page-status">
        <el-tag :type="statusTagType" size="small" effect="plain">{{ pageLabel }}</el-tag>
        <span class="page-hint">{{ pageHint }}</span>
      </div>

      <el-button type="primary" @click="goToChat" size="small">客服会话</el-button>
      <el-button @click="goToXhs" size="small">工作台</el-button>
      <el-button type="warning" @click="openLoginAssist" size="small">
        安全验证窗口
      </el-button>
      <el-button type="success" @click="triggerAutoLogin" size="small" :loading="loading">
        恢复登录
      </el-button>
      <el-button @click="saveLogin" size="small">保存登录态</el-button>
      <el-button v-if="needRelogin" type="warning" @click="goToLogin" size="small">
        重新登录
      </el-button>
    </div>

    <div class="browser-placeholder" v-if="!hasLoaded">
      <el-empty description="正在加载客服工作台...">
        <el-button type="primary" @click="goToXhs">重新加载</el-button>
      </el-empty>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { ElMessage } from 'element-plus'
import { ArrowLeft, ArrowRight, Refresh } from '@element-plus/icons-vue'
import { XHS_DASHBOARD_URL, XHS_LOGIN_URL, XHS_CHAT_URL } from '@/constants/xhs-urls'

const SHOP_ID = 'default'

const currentUrl = ref('')
const canGoBack = ref(false)
const canGoForward = ref(false)
const loading = ref(false)
const hasLoaded = ref(false)
const needRelogin = ref(false)

const isLoginUrl = (u: string) =>
  /\/cstools\/login|customer\.xiaohongshu\.com|ark\.xiaohongshu\.com\/ark\/login/i.test(u || '')

const isChatUrl = (u: string) => /\/cstools\/chat/i.test(u || '')
const isWorkbenchUrl = (u: string) =>
  /walle\.xiaohongshu\.com\/cstools\//i.test(u || '') && !isLoginUrl(u)

const pageLabel = computed(() => {
  const u = currentUrl.value
  if (!u) return '准备中'
  if (isLoginUrl(u)) return '需重新登录'
  if (isChatUrl(u)) return '客服会话'
  if (isWorkbenchUrl(u)) return '客服工作台'
  return '小红书页面'
})

const statusTagType = computed(() => {
  if (needRelogin.value || isLoginUrl(currentUrl.value)) return 'warning'
  if (isWorkbenchUrl(currentUrl.value) || isChatUrl(currentUrl.value)) return 'success'
  return 'info'
})

const pageHint = computed(() => {
  if (needRelogin.value || isLoginUrl(currentUrl.value)) {
    return '登录态失效，请用客服邮箱登录（不是商家扫码）'
  }
  if (isChatUrl(currentUrl.value)) {
    return '用于新订单发起对话、发送激活码等话术'
  }
  return '登录态保活中 · 订单由后台探测，无需打开商家后台网址'
})

const goToXhs = async () => {
  await loadUrl(XHS_DASHBOARD_URL)
}

const goToChat = async () => {
  await loadUrl(XHS_CHAT_URL)
}

const goToLogin = async () => {
  await openLoginAssist()
}

const openLoginAssist = async () => {
  try {
    await window.electronAPI?.browserOpenLoginAssist?.()
    ElMessage.info('已打开独立登录窗，请在该窗口完成安全验证（点选图片后点验证）')
  } catch {
    ElMessage.error('无法打开验证窗口')
  }
}

const triggerAutoLogin = async () => {
  loading.value = true
  try {
    const ok = await window.electronAPI?.autoLogin(SHOP_ID)
    if (ok) {
      ElMessage.success('已恢复登录态')
      needRelogin.value = false
      hasLoaded.value = true
      currentUrl.value = await window.electronAPI!.browserGetUrl()
      await goToChat()
    } else {
      ElMessage.warning('无法自动恢复：请重新登录客服邮箱，成功后点「保存登录态」')
      needRelogin.value = true
      await goToLogin()
    }
  } finally {
    loading.value = false
  }
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
  currentUrl.value = targetUrl
  needRelogin.value = isLoginUrl(targetUrl)
  loading.value = false
  await updateNavState()
}

const saveLogin = async () => {
  if (!window.electronAPI) return
  const ok = await window.electronAPI.saveCookies(SHOP_ID)
  if (ok) {
    await window.electronAPI.initShopPhase2(SHOP_ID)
    needRelogin.value = false
    ElMessage.success('登录态已保存，下次启动将自动恢复')
  } else {
    ElMessage.error('保存失败：请先进入客服工作台（能看到店铺名），再点保存')
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
  currentUrl.value = await window.electronAPI.browserGetUrl()
  needRelogin.value = isLoginUrl(currentUrl.value)
}

const onUrlChanged = (newUrl: string) => {
  currentUrl.value = newUrl
  hasLoaded.value = true
  needRelogin.value = isLoginUrl(newUrl)
  updateNavState()
}

const onLoadingChanged = (isLoading: boolean) => {
  loading.value = isLoading
  if (!isLoading) updateNavState()
}

const onLoginRequired = () => {
  needRelogin.value = true
}

onMounted(async () => {
  if (!window.electronAPI) return
  window.electronAPI.onBrowserUrlChange(onUrlChanged)
  window.electronAPI.onBrowserLoading(onLoadingChanged)
  window.electronAPI.onLoginRequired?.(onLoginRequired)

  const current = await window.electronAPI.browserGetUrl()
  if (current && current.includes('xiaohongshu.com')) {
    hasLoaded.value = true
    currentUrl.value = current
    needRelogin.value = isLoginUrl(current)
    await window.electronAPI.browserShow()
  } else {
    await window.electronAPI.browserShow()
    hasLoaded.value = true
  }
})

onUnmounted(() => {
  // preload 侧多为一次性订阅；无 remove 则忽略
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

.page-status {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  padding: 0 8px;
}

.page-hint {
  color: #909399;
  font-size: 12px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.browser-placeholder {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
