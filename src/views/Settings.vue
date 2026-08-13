<template>
  <div class="settings page-container">
    <div class="card">
      <h2 class="page-title">系统设置</h2>

      <el-form label-width="120px">
        <el-divider content-position="left">基本设置</el-divider>

        <el-form-item label="开机自启">
          <el-switch v-model="settings.autoStart" @change="saveSetting('autoStart', $event)" />
        </el-form-item>

        <el-divider content-position="left">WebSocket 设置</el-divider>

        <el-form-item label="WebSocket 地址">
          <el-input v-model="settings.wsUrl" @blur="saveSetting('wsUrl', settings.wsUrl)" />
        </el-form-item>

        <el-form-item label="心跳间隔">
          <el-input-number v-model="settings.heartbeatInterval" :min="10" :max="120" @change="saveSetting('heartbeatInterval', $event)" />
          <span class="form-tip">秒</span>
        </el-form-item>

        <el-divider content-position="left">自动发货设置</el-divider>

        <el-form-item label="订单轮询间隔">
          <el-input-number v-model="settings.orderPollInterval" :min="5" :max="300" @change="saveSetting('orderPollInterval', $event)" />
          <span class="form-tip">秒</span>
        </el-form-item>

        <el-divider content-position="left">客服账号登录（邮箱）</el-divider>

        <el-form-item label="邮箱账号">
          <el-input v-model="mainLogin.email" placeholder="客服子账号邮箱" style="width: 240px" />
        </el-form-item>
        <el-form-item label="密码">
          <el-input v-model="mainLogin.password" placeholder="登录密码" type="password" show-password style="width: 240px" />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="saveMainLogin">保存账号</el-button>
          <el-button type="success" @click="triggerAutoLogin">立即自动登录</el-button>
        </el-form-item>
        <el-alert
          type="info"
          :closable="false"
          show-icon
          title="说明：此处填写的是小红书客服邮箱账号（不是千帆 ark 扫码账号）。原版会隐藏扫码入口并自动填邮箱登录。"
          style="margin-bottom: 16px"
        />

        <el-divider content-position="left">子账号管理</el-divider>

        <el-form-item label="添加子账号">
          <el-input v-model="subForm.username" placeholder="用户名" style="width: 140px; margin-right: 8px" />
          <el-input v-model="subForm.password" placeholder="密码" type="password" style="width: 140px; margin-right: 8px" />
          <el-button type="primary" @click="addSubAccount">添加</el-button>
        </el-form-item>

        <el-table :data="subAccounts" border size="small" style="margin-bottom: 16px">
          <el-table-column prop="username" label="用户名" />
          <el-table-column prop="sub_account_id" label="子账号ID" />
          <el-table-column label="操作" width="120">
            <template #default="{ row }">
              <el-button text @click="loginSub(row.id)">登录</el-button>
            </template>
          </el-table-column>
        </el-table>

        <el-divider content-position="left">软件更新</el-divider>

        <el-form-item label="自动检查更新">
          <el-switch v-model="settings.autoUpdate" @change="saveSetting('autoUpdate', $event)" />
        </el-form-item>

        <el-form-item>
          <el-button type="primary" @click="checkUpdate">检查更新</el-button>
          <el-button @click="refreshServiceTicket">刷新 ServiceTicket</el-button>
        </el-form-item>
      </el-form>
    </div>

    <div class="card">
      <h3 class="section-title">系统日志</h3>
      <div class="log-panel">
        <div v-for="(log, i) in logs" :key="i" class="log-line">{{ log }}</div>
      </div>
      <el-button @click="refreshLogs" style="margin-top: 12px">刷新日志</el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import type { SubAccount } from '../types/electron'

const SHOP_ID = 'default'

const settings = ref({
  autoStart: false,
  closeToTray: true,
  wsUrl: 'wss://xhsmsgwebsocket.agiso.com',
  heartbeatInterval: 30,
  orderPollInterval: 30,
  shipRetryCount: 3,
  autoUpdate: true
})

const mainLogin = ref({ email: '', password: '' })
const subForm = ref({ username: '', password: '' })
const subAccounts = ref<SubAccount[]>([])
const logs = ref<string[]>([])

const saveSetting = async (key: string, value: unknown) => {
  if (window.electronAPI) {
    await window.electronAPI.setConfig(key, value)
  }
  ElMessage.success('设置已保存')
}

const saveMainLogin = async () => {
  if (!mainLogin.value.email) {
    ElMessage.warning('请输入客服邮箱账号')
    return
  }
  const pwd = mainLogin.value.password === '********' ? '' : mainLogin.value.password
  await window.electronAPI?.saveMainLogin(SHOP_ID, mainLogin.value.email, pwd)
  ElMessage.success('客服邮箱账号已保存（用于自动登录）')
}

const triggerAutoLogin = async () => {
  if (mainLogin.value.email) {
    const pwd = mainLogin.value.password === '********' ? '' : mainLogin.value.password
    await window.electronAPI?.saveMainLogin(SHOP_ID, mainLogin.value.email, pwd)
  }
  const ok = await window.electronAPI?.autoLogin(SHOP_ID)
  ElMessage.info(ok ? '自动登录成功' : '自动登录未完成，请到「浏览器」页手动登录后点保存登录')
  logs.value = (await window.electronAPI?.getLogs(200)) || logs.value
}

const addSubAccount = async () => {
  if (!subForm.value.username || !subForm.value.password) {
    ElMessage.warning('请输入用户名和密码')
    return
  }
  await window.electronAPI?.addSubAccount({
    shopId: SHOP_ID,
    username: subForm.value.username,
    password: subForm.value.password
  })
  subForm.value = { username: '', password: '' }
  subAccounts.value = await window.electronAPI!.getSubAccounts(SHOP_ID)
  ElMessage.success('子账号已添加')
}

const loginSub = async (id: number) => {
  const ok = await window.electronAPI?.loginSubAccount(id)
  ElMessage.info(ok ? '子账号登录已触发' : '登录失败')
}

const checkUpdate = async () => {
  const result = await window.electronAPI?.checkUpdate()
  ElMessage.info(result ? '正在检查更新...' : '检查失败')
}

const refreshServiceTicket = async () => {
  const ok = await window.electronAPI?.refreshServiceTicket()
  ElMessage.info(ok ? 'ServiceTicket 已刷新' : '刷新失败')
}

const refreshLogs = async () => {
  if (window.electronAPI) {
    logs.value = await window.electronAPI.getLogs(200)
  }
}

onMounted(async () => {
  if (window.electronAPI) {
    const config = await window.electronAPI.getAllConfig()
    Object.assign(settings.value, config)
    subAccounts.value = await window.electronAPI.getSubAccounts(SHOP_ID)
    logs.value = await window.electronAPI.getLogs(200)
    const saved = await window.electronAPI.getMainLogin?.(SHOP_ID)
    if (saved?.email) {
      mainLogin.value.email = saved.email
      if (saved.hasPassword) mainLogin.value.password = '********'
    }
  }
})
</script>

<style scoped>
.form-tip {
  font-size: 12px;
  color: #909399;
  margin-left: 8px;
}
.section-title {
  font-size: 16px;
  font-weight: 600;
  margin-bottom: 16px;
}
.log-panel {
  max-height: 300px;
  overflow-y: auto;
  background: #1e1e1e;
  border-radius: 4px;
  padding: 12px;
  font-family: Consolas, monospace;
  font-size: 12px;
  color: #d4d4d4;
}
.log-line {
  padding: 2px 0;
  word-break: break-all;
}
</style>
