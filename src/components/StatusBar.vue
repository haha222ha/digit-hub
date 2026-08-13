<template>
  <div class="status-bar">
    <div class="status-left">
      <span class="status-item">
        <span class="status-dot" :class="wsStatusClass"></span>
        WebSocket: {{ wsStatusText }}
      </span>
      <span class="status-item">
        <span class="status-dot" :class="licenseStatusClass"></span>
        授权: {{ licenseStatusText }}
      </span>
    </div>
    <div class="status-right">
      <span class="status-item">v{{ appVersion }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useLicenseStore } from '../stores/license'

const licenseStore = useLicenseStore()
const appVersion = ref('1.0.0')
const wsStatus = ref<'Closed' | 'Connecting' | 'Open'>('Closed')

const wsStatusText = computed(() => {
  const map = { Closed: '已断开', Connecting: '连接中', Open: '已连接' }
  return map[wsStatus.value]
})

const wsStatusClass = computed(() => {
  const map = { Closed: 'danger', Connecting: 'warning', Open: 'success' }
  return map[wsStatus.value]
})

const licenseStatusText = computed(() => {
  if (!licenseStore.info) return '未激活'
  if (licenseStore.info.status === 'active') return '已激活'
  if (licenseStore.info.status === 'trial') return `试用(${licenseStore.info.trialDaysLeft}天)`
  if (licenseStore.info.status === 'expired') return '已过期'
  return '未激活'
})

const licenseStatusClass = computed(() => {
  if (!licenseStore.info) return 'danger'
  if (licenseStore.info.status === 'active') return 'success'
  if (licenseStore.info.status === 'trial') return 'warning'
  return 'danger'
})

onMounted(async () => {
  if (window.electronAPI) {
    const status = await window.electronAPI.getWsStatus()
    wsStatus.value = (status.main?.status || status.status || 'Closed') as typeof wsStatus.value

    window.electronAPI.onWsStatusChange((s: string) => {
      wsStatus.value = s as typeof wsStatus.value
    })
  }
})
</script>

<style scoped>
.status-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  height: 28px;
  background: #fff;
  border-top: 1px solid #e4e7ed;
  padding: 0 12px;
  font-size: 12px;
  color: #606266;
}

.status-left {
  display: flex;
  gap: 16px;
}

.status-item {
  display: flex;
  align-items: center;
}

.status-dot {
  display: inline-block;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  margin-right: 4px;
}

.status-dot.success {
  background-color: #67c23a;
}

.status-dot.warning {
  background-color: #e6a23c;
}

.status-dot.danger {
  background-color: #f56c6c;
}
</style>