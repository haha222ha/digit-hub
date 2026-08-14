<template>
  <div class="dashboard page-container">
    <div class="header">
      <h2 class="page-title">仪表盘</h2>
      <el-button type="primary" @click="$router.push('/browser')">打开小红书后台</el-button>
    </div>

    <el-row :gutter="20">
      <el-col :span="6">
        <div class="card stat-card">
          <div class="stat-icon shipping">
            <el-icon :size="24"><Box /></el-icon>
          </div>
          <div class="stat-content">
            <div class="stat-value">{{ stats.todayShipping }}</div>
            <div class="stat-label">今日发货</div>
          </div>
        </div>
      </el-col>
      <el-col :span="6">
        <div class="card stat-card">
          <div class="stat-icon order">
            <el-icon :size="24"><ShoppingCart /></el-icon>
          </div>
          <div class="stat-content">
            <div class="stat-value">{{ stats.pendingOrders }}</div>
            <div class="stat-label">待处理订单</div>
          </div>
        </div>
      </el-col>
      <el-col :span="6">
        <div class="card stat-card">
          <div class="stat-icon message">
            <el-icon :size="24"><ChatDotRound /></el-icon>
          </div>
          <div class="stat-content">
            <div class="stat-value">{{ stats.todayMessages }}</div>
            <div class="stat-label">今日消息</div>
          </div>
        </div>
      </el-col>
      <el-col :span="6">
        <div class="card stat-card">
          <div class="stat-icon reply">
            <el-icon :size="24"><Promotion /></el-icon>
          </div>
          <div class="stat-content">
            <div class="stat-value">{{ stats.autoReplies }}</div>
            <div class="stat-label">自动回复</div>
          </div>
        </div>
      </el-col>
    </el-row>

    <el-row :gutter="20" style="margin-top: 20px;">
      <el-col :span="12">
        <div class="card">
          <div class="card-header">
            <span>系统状态</span>
          </div>
          <div class="status-list">
            <div class="status-row">
              <span>WebSocket 连接</span>
              <el-tag :type="wsStatusType" size="small">{{ wsStatusText }}</el-tag>
            </div>
            <div class="status-row">
              <span>授权状态</span>
              <el-tag :type="licenseStatusType" size="small">{{ licenseStatusText }}</el-tag>
            </div>
            <div class="status-row">
              <span>自动发货</span>
              <el-tag :type="autoShipEnabled ? 'success' : 'info'" size="small">
                {{ autoShipEnabled ? '已开启' : '未开启' }}
              </el-tag>
            </div>
            <div class="status-row">
              <span>自动回复</span>
              <el-tag :type="autoReplyEnabled ? 'success' : 'info'" size="small">
                {{ autoReplyEnabled ? '已开启' : '未开启' }}
              </el-tag>
            </div>
            <div class="status-row">
              <span>内存</span>
              <span class="hint-text">{{ sysStats.rssMb }} MB / 系统剩余 {{ sysStats.freememMb }} MB</span>
            </div>
            <div class="status-row">
              <span>运行时长</span>
              <span class="hint-text">{{ sysUptime }}</span>
            </div>
          </div>
        </div>
      </el-col>
      <el-col :span="12">
        <div class="card">
          <div class="card-header">
            <span>最近日志</span>
            <el-button text @click="$router.push('/settings')">查看全部</el-button>
          </div>
          <div class="log-list">
            <div v-for="(log, i) in recentLogs" :key="i" class="log-item">
              {{ log }}
            </div>
          </div>
        </div>
      </el-col>
    </el-row>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { Box, ShoppingCart, ChatDotRound, Promotion } from '@element-plus/icons-vue'
import { useLicenseStore } from '../stores/license'

const licenseStore = useLicenseStore()

const stats = ref({
  todayShipping: 0,
  pendingOrders: 0,
  todayMessages: 0,
  autoReplies: 0
})

const wsStatus = ref('Closed')
const autoShipEnabled = ref(false)
const autoReplyEnabled = ref(false)
const recentLogs = ref<string[]>([])
const sysStats = ref({ rssMb: 0, freememMb: 0, totalmemMb: 0, uptimeSec: 0, cpuCount: 0, heapMb: 0 })
const sysUptime = computed(() => {
  const s = sysStats.value.uptimeSec || 0
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  return `${h}小时${m}分`
})

const wsStatusText = computed(() => {
  const map: Record<string, string> = { Closed: '已断开', Connecting: '连接中', Open: '已连接' }
  return map[wsStatus.value] || '未知'
})

const wsStatusType = computed(() => {
  const map: Record<string, string> = { Closed: 'danger', Connecting: 'warning', Open: 'success' }
  return map[wsStatus.value] || 'info'
})

const licenseStatusText = computed(() => {
  if (!licenseStore.info) return '未激活'
  const map: Record<string, string> = {
    active: '已激活',
    trial: `试用(${licenseStore.info.trialDaysLeft}天)`,
    expired: '已过期',
    unactivated: '未激活'
  }
  return map[licenseStore.info.status] || '未激活'
})

const licenseStatusType = computed(() => {
  if (!licenseStore.info) return 'danger'
  const map: Record<string, string> = {
    active: 'success',
    trial: 'warning',
    expired: 'danger',
    unactivated: 'danger'
  }
  return map[licenseStore.info.status] || 'danger'
})

onMounted(async () => {
  if (window.electronAPI) {
    const status = await window.electronAPI.getWsStatus()
    wsStatus.value = status.main?.status || status.status || 'Closed'

    window.electronAPI.onWsStatusChange((s: string) => {
      wsStatus.value = s as typeof wsStatus.value
    })

    const logs = await window.electronAPI.getLogs(20)
    recentLogs.value = logs

    const config = await window.electronAPI.getAllConfig() as Record<string, unknown>
    autoShipEnabled.value = !!config.autoShipEnabled
    autoReplyEnabled.value = !!config.autoReplyEnabled
    if (window.electronAPI.getSystemStats) {
      sysStats.value = await window.electronAPI.getSystemStats()
    }
  }
})
</script>

<style scoped>
.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.stat-card {
  display: flex;
  align-items: center;
  gap: 16px;
}

.stat-icon {
  width: 48px;
  height: 48px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
}

.stat-icon.shipping { background: #409eff; }
.stat-icon.order { background: #e6a23c; }
.stat-icon.message { background: #67c23a; }
.stat-icon.reply { background: #909399; }

.stat-value {
  font-size: 24px;
  font-weight: 600;
  color: #303133;
}

.stat-label {
  font-size: 13px;
  color: #909399;
  margin-top: 4px;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  font-weight: 600;
}

.status-list, .log-list {
  max-height: 200px;
  overflow-y: auto;
}

.status-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 0;
  border-bottom: 1px solid #f0f2f5;
}

.status-row:last-child {
  border-bottom: none;
}

.log-item {
  padding: 4px 0;
  font-size: 12px;
  color: #606266;
  font-family: monospace;
  word-break: break-all;
}
</style>