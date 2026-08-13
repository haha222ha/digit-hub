<template>
  <div class="shipping page-container">
    <div class="card">
      <div class="header">
        <h2 class="page-title">发货管理</h2>
        <div class="header-actions">
          <el-switch v-model="autoShipEnabled" active-text="自动发货" @change="toggleAutoShip" />
          <el-switch v-model="reshipEnabled" active-text="自动补发" @change="toggleReship" style="margin-left: 12px" />
          <el-button size="small" style="margin-left: 12px" @click="retryFailed">重试失败订单</el-button>
        </div>
      </div>

      <el-tabs v-model="activeTab">
        <!-- ============ 商品绑定 ============ -->
        <el-tab-pane label="商品绑定" name="bindings">
          <el-button type="primary" @click="openBindingDialog()" style="margin-bottom: 16px">
            添加商品绑定
          </el-button>
          <el-button style="margin-bottom: 16px; margin-left: 8px" :loading="syncingGoods" @click="syncGoods">
            同步千帆商品
          </el-button>
          <span v-if="goodsList.length > 0" class="hint-text" style="margin-left: 8px">
            已同步 {{ goodsList.length }} 个商品
          </span>

          <el-table :data="bindings" border>
            <el-table-column prop="product_id" label="商品ID" width="160" />
            <el-table-column prop="product_name" label="商品名称" />
            <el-table-column prop="deliver_type" label="发货类型" width="100">
              <template #default="{ row }">
                <el-tag size="small">{{ deliverTypeText(row.deliver_type) }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="stock" label="库存" width="80" />
            <el-table-column label="告警" width="90">
              <template #default="{ row }">
                <el-tag v-if="row.stock <= (row.low_stock_alert ?? 10)" type="warning" size="small">低库存</el-tag>
                <span v-else>-</span>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="200">
              <template #default="{ row }">
                <el-button text @click="openBindingDialog(row)">编辑</el-button>
                <el-button text @click="openCardDialog(row)">卡密</el-button>
                <el-button text type="danger" @click="removeBinding(row)">删除</el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-tab-pane>

        <!-- ============ 发货记录 ============ -->
        <el-tab-pane label="发货记录" name="logs">
          <el-table :data="shipLogs" border>
            <el-table-column prop="order_id" label="订单号" />
            <el-table-column prop="tracking_number" label="物流/内容" />
            <el-table-column prop="status" label="状态" width="120">
              <template #default="{ row }">
                <el-tag :type="getStatusType(row.status)" size="small">{{ getStatusText(row.status) }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="error_msg" label="错误信息" />
            <el-table-column prop="created_at" label="时间" width="180" />
          </el-table>
        </el-tab-pane>

        <!-- ============ 订单查询 ============ -->
        <el-tab-pane label="订单查询" name="orders">
          <div class="query-bar">
            <el-input v-model="orderQuery.orderId" placeholder="输入小红书订单号" clearable style="width: 260px" />
            <el-select v-model="orderQuery.status" placeholder="状态" clearable style="width: 140px; margin-left: 8px">
              <el-option label="成功" value="success" />
              <el-option label="失败" value="fail" />
              <el-option label="发送中" value="sending" />
              <el-option label="待发送" value="pending" />
              <el-option label="已作废" value="disabled" />
            </el-select>
            <el-button type="primary" style="margin-left: 8px" @click="loadDeliveries">查询</el-button>
          </div>

          <el-table :data="deliveries" border style="margin-top: 16px">
            <el-table-column prop="order_id" label="订单号" width="180" />
            <el-table-column prop="product_id" label="商品ID" width="140" />
            <el-table-column prop="card_content" label="卡密/内容">
              <template #default="{ row }">
                <span>{{ maskContent(row.card_content) }}</span>
                <el-button v-if="row.card_content" text type="primary" @click="copyCard(row.card_content)">复制</el-button>
              </template>
            </el-table-column>
            <el-table-column prop="send_status" label="状态" width="100">
              <template #default="{ row }">
                <el-tag :type="getDeliveryStatusType(row.send_status)" size="small">{{ getDeliveryStatusText(row.send_status) }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="轮次" width="70">
              <template #default="{ row }">{{ row.msg_index }}/{{ row.msg_total }}</template>
            </el-table-column>
            <el-table-column prop="retry_count" label="重试" width="60" />
            <el-table-column label="操作" width="150">
              <template #default="{ row }">
                <el-button v-if="row.send_status === 'fail'" text type="primary" @click="resendOrder(row)">重发</el-button>
                <el-button v-if="row.send_status !== 'disabled'" text type="danger" @click="disableOrder(row)">作废</el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-tab-pane>
      </el-tabs>
    </div>

    <!-- ============ 绑定弹窗 ============ -->
    <el-dialog v-model="showBinding" :title="editingBinding ? '编辑绑定' : '添加绑定'" width="620px">
      <el-form :model="bindingForm" label-width="100px">
        <el-form-item label="选择商品">
          <el-select
            v-model="selectedGoods"
            filterable
            clearable
            placeholder="从同步的商品中选择（可选）"
            style="width: 100%"
            :disabled="!!editingBinding"
            @change="onSelectGoods"
          >
            <el-option v-for="g in goodsList" :key="g.itemId" :label="g.title + ' (' + g.itemId + ')'" :value="g.itemId" />
          </el-select>
        </el-form-item>
        <el-form-item label="商品ID" required>
          <el-input v-model="bindingForm.productId" :disabled="!!editingBinding" placeholder="选择商品后自动填充，或手动输入商品ID" />
        </el-form-item>
        <el-form-item label="商品名称">
          <el-input v-model="bindingForm.productName" />
        </el-form-item>
        <el-form-item label="发货类型">
          <el-select v-model="bindingForm.deliverType" style="width: 100%">
            <el-option label="激活码/卡密" value="card" />
            <el-option label="固定文本" value="text" />
            <el-option label="网盘链接" value="link" />
            <el-option label="笔记/网址凭证" value="note" />
            <el-option label="图片" value="image" />
            <el-option label="视频" value="video" />
            <el-option label="多段组合(JSON)" value="mixed" />
            <el-option label="手动" value="manual" />
          </el-select>
        </el-form-item>
        <el-form-item label="发货内容">
          <el-input
            v-model="bindingForm.deliverContent"
            type="textarea"
            :rows="6"
            :placeholder="contentPlaceholder"
          />
          <div class="template-hint">
            <span>模板变量：</span>
            <el-tag v-for="v in templateVars" :key="v.key" size="small" style="margin-right: 4px; cursor: pointer" @click="insertVar(v.key)">
              {{ v.key }}
            </el-tag>
            <span class="hint-text">（空一行 = 拆分下一条消息）</span>
          </div>
        </el-form-item>
        <el-form-item label="随机发货">
          <el-switch v-model="bindingForm.randomMode" />
        </el-form-item>
        <el-form-item label="随机码长度">
          <el-input-number v-model="bindingForm.uidLength" :min="4" :max="32" />
          <span class="hint-text" style="margin-left: 8px">{uid} 占位符长度</span>
        </el-form-item>
        <el-form-item label="消息间隔">
          <el-input-number v-model="bindingForm.sendIntervalMs" :min="0" :max="10000" :step="100" />
          <span class="hint-text" style="margin-left: 8px">多轮消息间隔(毫秒)</span>
        </el-form-item>
        <el-form-item label="库存告警阈值">
          <el-input-number v-model="bindingForm.lowStockAlert" :min="0" :max="10000" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showBinding = false">取消</el-button>
        <el-button type="primary" @click="saveBinding">保存</el-button>
      </template>
    </el-dialog>

    <!-- ============ 卡密管理弹窗 ============ -->
    <el-dialog v-model="showCards" title="卡密池管理" width="700px">
      <div class="card-toolbar">
        <el-button type="primary" @click="showCardImport = true">批量导入</el-button>
        <el-select v-model="cardFilter" placeholder="状态筛选" style="width: 140px; margin-left: 8px" @change="loadCards">
          <el-option label="全部" value="all" />
          <el-option label="未使用" value="unused" />
          <el-option label="已使用" value="used" />
          <el-option label="已锁定" value="locked" />
        </el-select>
        <span class="card-stats" style="margin-left: auto">
          总数 {{ cardStats.total }} | 未用 {{ cardStats.unused }} | 已用 {{ cardStats.used }} | 锁定 {{ cardStats.locked }}
        </span>
      </div>

      <el-table :data="cardList" border max-height="360" style="margin-top: 12px">
        <el-table-column prop="card_content" label="卡密内容" />
        <el-table-column prop="status" label="状态" width="90">
          <template #default="{ row }">
            <el-tag :type="row.status === 'used' ? 'success' : row.status === 'locked' ? 'warning' : 'info'" size="small">
              {{ row.status === 'used' ? '已用' : row.status === 'locked' ? '锁定' : '未用' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="order_id" label="关联订单" width="160" />
        <el-table-column prop="created_at" label="时间" width="180" />
      </el-table>
    </el-dialog>

    <!-- ============ 卡密导入弹窗 ============ -->
    <el-dialog v-model="showCardImport" title="批量导入卡密" width="500px" append-to-body>
      <el-input v-model="cardText" type="textarea" :rows="10" placeholder="每行一条卡密" />
      <el-checkbox v-model="skipDuplicate" style="margin-top: 8px">跳过重复卡密</el-checkbox>
      <template #footer>
        <el-button @click="showCardImport = false">取消</el-button>
        <el-button type="primary" @click="saveCards">导入</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { ProductBinding, ShipLog, CardPoolItem, OrderDelivery } from '../types/electron'

const SHOP_ID = 'default'
const activeTab = ref('bindings')
const autoShipEnabled = ref(false)
const reshipEnabled = ref(false)
const bindings = ref<ProductBinding[]>([])
const shipLogs = ref<ShipLog[]>([])
const showBinding = ref(false)
const showCards = ref(false)
const showCardImport = ref(false)
const editingBinding = ref<ProductBinding | null>(null)
const cardBindingId = ref(0)
const cardText = ref('')
const skipDuplicate = ref(true)
const cardFilter = ref('all')
const cardList = ref<CardPoolItem[]>([])
const cardStats = ref({ total: 0, unused: 0, used: 0, locked: 0 })
const deliveries = ref<OrderDelivery[]>([])

const orderQuery = ref({ orderId: '', status: '' })

const syncingGoods = ref(false)
const goodsList = ref<Array<{ itemId: string; title: string; noteId?: string; price?: string; stock?: string; image?: string }>>([])
const selectedGoods = ref('')

const bindingForm = ref({
  productId: '',
  productName: '',
  deliverType: 'card' as 'card' | 'text' | 'link' | 'note' | 'image' | 'video' | 'mixed' | 'manual',
  deliverContent: '',
  randomMode: false,
  uidLength: 10,
  sendIntervalMs: 500,
  lowStockAlert: 10
})

const templateVars = [
  { key: '{订单号}', desc: '订单号' },
  { key: '{买家昵称}', desc: '买家昵称' },
  { key: '{商品名}', desc: '商品名' },
  { key: '{卡密}', desc: '卡密' },
  { key: '{店铺名}', desc: '店铺名' },
  { key: '{uid}', desc: '随机码' },
  { key: '{ts}', desc: '时间戳' }
]

const contentPlaceholder = computed(() => {
  const map: Record<string, string> = {
    card: '如：https://xxx.com/redeem?code={卡密}（卡密从池中消耗）',
    text: '如：您好，{买家昵称}，感谢购买【{商品名}】',
    link: '如：https://pan.xxx.com/s/ABC123 提取码：{卡密}',
    note: '如：https://www.xiaohongshu.com/xxx（网址发货凭证，发给买家）',
    image: '图片 URL',
    video: '视频内容',
    mixed: 'JSON 数组，如 [{"type":"text","content":"你好"},{"type":"note","content":"https://..."}]',
    manual: '手动发货，无需内容'
  }
  return map[bindingForm.value.deliverType] || ''
})

const deliverTypeText = (t: string) => {
  const map: Record<string, string> = {
    card: '卡密', text: '文本', link: '链接', note: '网址凭证', image: '图片', video: '视频', mixed: '多段', manual: '手动'
  }
  return map[t] || t
}

const getStatusType = (status: string) => {
  const map: Record<string, string> = { success: 'success', mock_success: 'success', failed: 'danger', pending_manual: 'warning' }
  return map[status] || 'info'
}

const getStatusText = (status: string) => {
  const map: Record<string, string> = {
    success: '成功', mock_success: '模拟成功', failed: '失败',
    pending_manual: '待手动', no_binding: '未绑定', out_of_stock: '缺货'
  }
  return map[status] || status
}

const getDeliveryStatusType = (s: string) => {
  const map: Record<string, string> = { success: 'success', fail: 'danger', sending: 'warning', pending: 'info', disabled: 'info' }
  return map[s] || 'info'
}

const getDeliveryStatusText = (s: string) => {
  const map: Record<string, string> = { success: '成功', fail: '失败', sending: '发送中', pending: '待发送', disabled: '已作废' }
  return map[s] || s
}

const maskContent = (content: string | null) => {
  if (!content) return '-'
  if (content.length <= 8) return content
  return content.slice(0, 8) + '****'
}

const copyCard = async (content: string) => {
  try {
    await navigator.clipboard.writeText(content)
    ElMessage.success('已复制完整内容')
  } catch {
    ElMessage.warning('复制失败')
  }
}

const insertVar = (v: string) => {
  bindingForm.value.deliverContent += v
}

const loadData = async () => {
  if (!window.electronAPI) return
  bindings.value = await window.electronAPI.listProductBindings(SHOP_ID)
  shipLogs.value = await window.electronAPI.getShipLogs(SHOP_ID, 100)
  const reship = await window.electronAPI.getReshipConfig(SHOP_ID)
  reshipEnabled.value = !!reship?.enabled
}

const syncGoods = async () => {
  if (!window.electronAPI) return
  syncingGoods.value = true
  try {
    const res = await window.electronAPI.syncGoodsList()
    if (res?.success) {
      goodsList.value = res.goods || []
      ElMessage.success(`同步成功，共 ${goodsList.value.length} 个商品`)
    } else {
      ElMessage.warning(res?.error || '同步失败')
    }
  } finally {
    syncingGoods.value = false
  }
}

const onSelectGoods = (itemId: string) => {
  if (!itemId) return
  const g = goodsList.value.find((x) => x.itemId === itemId)
  if (g) {
    bindingForm.value.productId = g.itemId
    bindingForm.value.productName = g.title
  }
}

const loadDeliveries = async () => {
  if (!window.electronAPI) return
  if (orderQuery.value.orderId) {
    const detail = await window.electronAPI.getOrderDeliveryDetail(orderQuery.value.orderId)
    deliveries.value = detail || []
    if (!detail || detail.length === 0) ElMessage.info('发货消息不存在')
  } else {
    const res = await window.electronAPI.getOrderDeliveries({ shopId: SHOP_ID, status: orderQuery.value.status || 'all' })
    deliveries.value = res?.items || []
  }
}

const toggleAutoShip = async (val: boolean) => {
  await window.electronAPI?.setConfig('autoShipEnabled', val)
  if (val) await window.electronAPI?.startAutoShip()
  else await window.electronAPI?.stopAutoShip()
  ElMessage.success(`自动发货已${val ? '开启' : '关闭'}`)
}

const toggleReship = async (val: boolean) => {
  await window.electronAPI?.setReshipConfig(SHOP_ID, { enabled: val, retryIntervalMs: 10000 })
  ElMessage.success(`自动补发已${val ? '开启' : '关闭'}`)
}

const retryFailed = async () => {
  const n = await window.electronAPI?.retryFailedDeliveries()
  ElMessage.success(`已重试 ${n} 条失败订单`)
  await loadDeliveries()
}

const openBindingDialog = (row?: ProductBinding) => {
  editingBinding.value = row || null
  selectedGoods.value = ''
  if (row) {
    bindingForm.value = {
      productId: row.product_id,
      productName: row.product_name,
      deliverType: row.deliver_type as any,
      deliverContent: row.deliver_content,
      randomMode: !!row.random_mode,
      uidLength: row.uid_length ?? 10,
      sendIntervalMs: row.send_interval_ms ?? 500,
      lowStockAlert: row.low_stock_alert ?? 10
    }
  } else {
    bindingForm.value = { productId: '', productName: '', deliverType: 'card', deliverContent: '', randomMode: false, uidLength: 10, sendIntervalMs: 500, lowStockAlert: 10 }
  }
  showBinding.value = true
}

const saveBinding = async () => {
  if (!bindingForm.value.productId) {
    ElMessage.warning('请输入商品ID')
    return
  }
  if (!window.electronAPI) return

  const payload = {
    shopId: SHOP_ID,
    productId: bindingForm.value.productId,
    productName: bindingForm.value.productName,
    deliverType: bindingForm.value.deliverType,
    deliverContent: bindingForm.value.deliverContent,
    randomMode: bindingForm.value.randomMode,
    uidLength: bindingForm.value.uidLength,
    sendIntervalMs: bindingForm.value.sendIntervalMs,
    lowStockAlert: bindingForm.value.lowStockAlert
  }

  if (editingBinding.value) {
    await window.electronAPI.updateProductBinding(editingBinding.value.id, payload)
  } else {
    await window.electronAPI.addProductBinding(payload)
  }
  showBinding.value = false
  await loadData()
  ElMessage.success('保存成功')
}

const removeBinding = (row: ProductBinding) => {
  ElMessageBox.confirm('确定删除此绑定？', '提示', { type: 'warning' })
    .then(async () => {
      await window.electronAPI?.deleteProductBinding(row.id)
      await loadData()
      ElMessage.success('已删除')
    })
    .catch(() => {})
}

const openCardDialog = (row: ProductBinding) => {
  cardBindingId.value = row.id
  cardText.value = ''
  cardFilter.value = 'all'
  showCards.value = true
  loadCards()
}

const loadCards = async () => {
  if (!window.electronAPI) return
  cardStats.value = await window.electronAPI.getCardStats(cardBindingId.value)
  cardList.value = await window.electronAPI.getCardList(cardBindingId.value, cardFilter.value, 100, 0)
}

const saveCards = async () => {
  const cards = cardText.value.split('\n').map(s => s.trim()).filter(Boolean)
  if (cards.length === 0) {
    ElMessage.warning('请输入卡密')
    return
  }
  const added = await window.electronAPI?.addCards(cardBindingId.value, cards, { skipDuplicate: skipDuplicate.value })
  showCardImport.value = false
  await loadData()
  await loadCards()
  ElMessage.success(`已导入 ${added} 条卡密（去重跳过 ${cards.length - (added || 0)} 条）`)
}

const resendOrder = async (row: OrderDelivery) => {
  const res = await window.electronAPI?.resendOrderDelivery(row.order_id)
  if (res?.success) ElMessage.success('已加入发送队列')
  else ElMessage.warning(res?.message || '重发失败')
  await loadDeliveries()
}

const disableOrder = async (row: OrderDelivery) => {
  ElMessageBox.confirm('确定作废该订单的发货消息？作废后无法重发', '提示', { type: 'warning' })
    .then(async () => {
      const res = await window.electronAPI?.disableOrderDelivery(row.order_id)
      ElMessage[res?.success ? 'success' : 'warning'](res?.message || '作废成功')
      await loadDeliveries()
    })
    .catch(() => {})
}

onMounted(async () => {
  if (window.electronAPI) {
    const config = await window.electronAPI.getAllConfig() as Record<string, unknown>
    autoShipEnabled.value = !!config.autoShipEnabled
    await loadData()
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
.header-actions {
  display: flex;
  align-items: center;
}
.template-hint {
  margin-top: 6px;
  font-size: 12px;
  color: #909399;
}
.hint-text {
  font-size: 12px;
  color: #909399;
}
.query-bar {
  display: flex;
  align-items: center;
}
.card-toolbar {
  display: flex;
  align-items: center;
}
.card-stats {
  font-size: 13px;
  color: #606266;
}
</style>
