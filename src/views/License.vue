<template>
  <div class="license-page page-container">
    <!-- 当前版本卡片 -->
    <div class="card edition-card">
      <div class="edition-header">
        <h2 class="page-title">授权管理</h2>
        <el-tag :type="editionTagType" size="large" effect="dark" class="edition-tag">
          {{ editionLabel }}
        </el-tag>
      </div>

      <el-alert
        v-if="licenseInfo?.status === 'trial'"
        title="试用模式"
        :description="`试用期剩余 ${licenseInfo.trialDaysLeft} 天，请尽快激活`"
        type="warning"
        show-icon
        :closable="false"
        style="margin-bottom: 20px;"
      />

      <el-alert
        v-if="licenseInfo?.status === 'expired' || licenseInfo?.status === 'unactivated'"
        title="授权已过期"
        description="请输入卡密激活软件"
        type="error"
        show-icon
        :closable="false"
        style="margin-bottom: 20px;"
      />

      <el-alert
        v-if="licenseInfo?.status === 'active'"
        title="已激活"
        :description="`激活时间: ${licenseInfo.activatedAt} | 到期时间: ${licenseInfo.expiresAt || '永久'}`"
        type="success"
        show-icon
        :closable="false"
        style="margin-bottom: 20px;"
      />
    </div>

    <!-- 激活码输入区 -->
    <div class="card">
      <h3 class="section-title">卡密激活</h3>
      <el-form label-width="100px">
        <el-form-item label="设备码">
          <el-input v-model="deviceCode" readonly>
            <template #append>
              <el-button @click="copyDeviceCode">复制</el-button>
            </template>
          </el-input>
          <div class="form-tip">请将此设备码发送给管理员获取卡密</div>
        </el-form-item>

        <el-form-item label="卡密">
          <el-input
            v-model="licenseKey"
            type="textarea"
            :rows="3"
            placeholder="请输入卡密，格式：设备码前8位-版本标记-时间戳-随机盐-RSA签名"
          />
          <div class="form-tip">
            卡密格式示例：<code>ABCD1234-PRO-1735689600-a1b2c3d4-签名...</code>
            <br />版本标记：BAS=基础版, PRO=专业版, ENT=企业版
          </div>
        </el-form-item>

        <el-form-item>
          <el-button type="primary" @click="handleActivate" :loading="activating">
            激活
          </el-button>
          <el-button @click="handleRefresh">刷新状态</el-button>
        </el-form-item>
      </el-form>
    </div>

    <!-- 功能权限矩阵 -->
    <div class="card">
      <h3 class="section-title">功能权限对照表</h3>
      <el-table :data="featureMatrix" border style="width: 100%">
        <el-table-column prop="feature" label="功能" width="200" />
        <el-table-column prop="desc" label="说明" />
        <el-table-column label="试用版" width="80" align="center">
          <template #default="{ row }">
            <el-icon v-if="row.trial" color="#67c23a"><Check /></el-icon>
            <el-icon v-else color="#f56c6c"><Close /></el-icon>
          </template>
        </el-table-column>
        <el-table-column label="基础版" width="80" align="center">
          <template #default="{ row }">
            <el-icon v-if="row.basic" color="#67c23a"><Check /></el-icon>
            <el-icon v-else color="#f56c6c"><Close /></el-icon>
          </template>
        </el-table-column>
        <el-table-column label="专业版" width="80" align="center">
          <template #default="{ row }">
            <el-icon v-if="row.pro" color="#67c23a"><Check /></el-icon>
            <el-icon v-else color="#f56c6c"><Close /></el-icon>
          </template>
        </el-table-column>
        <el-table-column label="企业版" width="80" align="center">
          <template #default="{ row }">
            <el-icon v-if="row.enterprise" color="#67c23a"><Check /></el-icon>
            <el-icon v-else color="#f56c6c"><Close /></el-icon>
          </template>
        </el-table-column>
      </el-table>

      <div class="edition-pricing">
        <div class="pricing-card" :class="{ active: currentEdition === 'trial' }">
          <h4>试用版</h4>
          <div class="price">免费</div>
          <div class="duration">3 天</div>
          <ul>
            <li>仪表盘</li>
            <li>手动发货</li>
            <li>1 个店铺</li>
          </ul>
        </div>
        <div class="pricing-card" :class="{ active: currentEdition === 'basic' }">
          <h4>基础版</h4>
          <div class="price">¥99/月</div>
          <div class="duration">1 个月起</div>
          <ul>
            <li>手动发货</li>
            <li>文本自动发货</li>
            <li>1 个店铺</li>
          </ul>
        </div>
        <div class="pricing-card" :class="{ active: currentEdition === 'pro' }">
          <h4>专业版</h4>
          <div class="price">¥299/月</div>
          <div class="duration">1 个月起</div>
          <ul>
            <li>卡密池自动发货</li>
            <li>链接自动发货</li>
            <li>自动回复</li>
            <li>5 个店铺</li>
            <li>子账号管理</li>
          </ul>
        </div>
        <div class="pricing-card" :class="{ active: currentEdition === 'enterprise' }">
          <h4>企业版</h4>
          <div class="price">¥999/月</div>
          <div class="duration">1 个月起</div>
          <ul>
            <li>无限店铺</li>
            <li>Swagger API 访问</li>
            <li>白标定制</li>
            <li>优先技术支持</li>
          </ul>
        </div>
      </div>
    </div>

    <!-- 设备信息 -->
    <div class="card">
      <h3 class="section-title">设备信息</h3>
      <el-descriptions :column="2" border>
        <el-descriptions-item label="CPU ID">{{ hardwareInfo?.cpuId }}</el-descriptions-item>
        <el-descriptions-item label="主板序列号">{{ hardwareInfo?.boardSerial }}</el-descriptions-item>
        <el-descriptions-item label="磁盘序列号">{{ hardwareInfo?.diskSerial }}</el-descriptions-item>
        <el-descriptions-item label="MAC 地址">{{ hardwareInfo?.macAddress }}</el-descriptions-item>
      </el-descriptions>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { Check, Close } from '@element-plus/icons-vue'
import { useLicenseStore } from '../stores/license'

const licenseStore = useLicenseStore()
const deviceCode = ref('')
const licenseKey = ref('')
const activating = ref(false)
const hardwareInfo = ref<any>(null)
const currentEdition = ref<'trial' | 'basic' | 'pro' | 'enterprise'>('trial')

const licenseInfo = ref(licenseStore.info)

const editionLabel = computed(() => {
  const map = {
    trial: '试用版',
    basic: '基础版',
    pro: '专业版',
    enterprise: '企业版'
  }
  return map[currentEdition.value] || '试用版'
})

const editionTagType = computed(() => {
  const map = {
    trial: 'info',
    basic: 'success',
    pro: 'warning',
    enterprise: 'danger'
  }
  return map[currentEdition.value] || 'info'
})

// 功能权限矩阵数据
const featureMatrix = ref([
  { feature: 'dashboard', desc: '仪表盘 - 数据概览', trial: true, basic: true, pro: true, enterprise: true },
  { feature: 'manual_ship', desc: '手动发货', trial: true, basic: true, pro: true, enterprise: true },
  { feature: 'auto_ship_text', desc: '文本自动发货', trial: false, basic: true, pro: true, enterprise: true },
  { feature: 'auto_ship_card', desc: '卡密池自动发货', trial: false, basic: false, pro: true, enterprise: true },
  { feature: 'auto_ship_link', desc: '链接自动发货', trial: false, basic: false, pro: true, enterprise: true },
  { feature: 'reply_rules', desc: '回复规则配置', trial: false, basic: true, pro: true, enterprise: true },
  { feature: 'auto_reply', desc: '自动回复', trial: false, basic: false, pro: true, enterprise: true },
  { feature: 'multi_shop', desc: '多店铺管理', trial: false, basic: false, pro: true, enterprise: true },
  { feature: 'sub_account', desc: '子账号管理', trial: false, basic: false, pro: true, enterprise: true },
  { feature: 'ship_log_export', desc: '发货日志导出', trial: false, basic: false, pro: true, enterprise: true },
  { feature: 'api_access', desc: 'Swagger API 访问', trial: false, basic: false, pro: false, enterprise: true },
  { feature: 'white_label', desc: '白标定制', trial: false, basic: false, pro: false, enterprise: true },
  { feature: 'priority_support', desc: '优先技术支持', trial: false, basic: false, pro: false, enterprise: true },
  { feature: 'unlimited_shops', desc: '无限店铺', trial: false, basic: false, pro: false, enterprise: true }
])

const copyDeviceCode = async () => {
  try {
    await navigator.clipboard.writeText(deviceCode.value)
    ElMessage.success('设备码已复制')
  } catch {
    ElMessage.error('复制失败')
  }
}

const handleActivate = async () => {
  if (!licenseKey.value.trim()) {
    ElMessage.warning('请输入卡密')
    return
  }

  activating.value = true
  try {
    const result = await licenseStore.activate(licenseKey.value)
    if (result.success) {
      ElMessage.success('激活成功')
      licenseInfo.value = licenseStore.info
      await loadEdition()
    } else {
      ElMessage.error(result.message || '激活失败')
    }
  } finally {
    activating.value = false
  }
}

const handleRefresh = async () => {
  await licenseStore.checkStatus()
  licenseInfo.value = licenseStore.info
  await loadEdition()
  ElMessage.success('状态已刷新')
}

const loadEdition = async () => {
  if (window.electronAPI?.getLicenseEdition) {
    currentEdition.value = await window.electronAPI.getLicenseEdition()
  }
}

onMounted(async () => {
  if (window.electronAPI) {
    deviceCode.value = await window.electronAPI.getDeviceCode()
    hardwareInfo.value = await window.electronAPI.getDeviceInfo()
  }
  await licenseStore.checkStatus()
  licenseInfo.value = licenseStore.info
  await loadEdition()
})
</script>

<style scoped>
.license-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.card {
  background: #fff;
  border-radius: 8px;
  padding: 20px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}

.edition-card {
  background: linear-gradient(135deg, #f5f7fa 0%, #ffffff 100%);
}

.edition-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.edition-tag {
  font-size: 16px;
  padding: 8px 24px;
  height: auto;
}

.page-title {
  font-size: 20px;
  font-weight: 600;
  margin: 0;
}

.section-title {
  font-size: 16px;
  font-weight: 600;
  margin-bottom: 16px;
}

.form-tip {
  font-size: 12px;
  color: #909399;
  margin-top: 4px;
  line-height: 1.6;
}

.form-tip code {
  background: #f5f7fa;
  padding: 2px 6px;
  border-radius: 4px;
  color: #409eff;
  font-family: monospace;
}

.edition-pricing {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
  margin-top: 20px;
}

.pricing-card {
  border: 2px solid #ebeef5;
  border-radius: 8px;
  padding: 16px;
  text-align: center;
  transition: all 0.3s;
}

.pricing-card.active {
  border-color: #409eff;
  background: #ecf5ff;
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(64, 158, 255, 0.2);
}

.pricing-card h4 {
  margin: 0 0 8px 0;
  font-size: 16px;
  color: #303133;
}

.pricing-card .price {
  font-size: 20px;
  font-weight: 600;
  color: #409eff;
  margin-bottom: 4px;
}

.pricing-card .duration {
  font-size: 12px;
  color: #909399;
  margin-bottom: 12px;
}

.pricing-card ul {
  list-style: none;
  padding: 0;
  margin: 0;
  text-align: left;
  font-size: 12px;
  color: #606266;
}

.pricing-card ul li {
  padding: 4px 0;
  border-top: 1px dashed #ebeef5;
}

.pricing-card ul li:first-child {
  border-top: none;
}
</style>
