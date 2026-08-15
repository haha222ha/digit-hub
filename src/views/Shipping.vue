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
      <p class="hint-text" style="margin: -4px 0 12px">
        商家统一面板：绑定按商品 ID，切换店铺不会清空列表。多店可把不同商品 ID 绑到同一测题/卡池；同一订单号只发一次。
      </p>

      <el-tabs v-model="activeTab">
        <!-- ============ 商品绑定 ============ -->
        <el-tab-pane label="商品绑定" name="bindings">
          <div style="margin-bottom: 16px; display: flex; align-items: center; flex-wrap: wrap; gap: 8px">
            <el-button type="primary" @click="openBindingDialog()">
              添加商品绑定
            </el-button>
            <el-button type="success" :loading="syncingGoods" @click="syncGoods">
              同步千帆商品
            </el-button>
            <el-button :disabled="syncingGoods" @click="openArkLogin">
              打开商家登录
            </el-button>
            <el-button type="danger" plain @click="clearAllBindings">清空全部绑定</el-button>
            <span v-if="goodsList.length > 0" class="hint-text">
              已同步 {{ goodsList.length }} 个商品{{ goodsSyncedAt ? `（${goodsSyncedAt}）` : '' }}；绑定列表为商家全量
            </span>
            <span v-else class="hint-text">
              客服登录≠商家后台；先「打开商家登录」或点同步后在弹出窗登录
            </span>
          </div>

          <!-- 已同步的店铺商品（绑卡入口） -->
          <el-card v-if="goodsList.length > 0" shadow="never" style="margin-bottom: 16px">
            <template #header>
              <span>店铺商品（同步结果）</span>
            </template>
            <el-table :data="goodsList" border max-height="280" size="small">
              <el-table-column prop="itemId" label="商品ID" width="180" />
              <el-table-column prop="title" label="商品名称" min-width="200" show-overflow-tooltip />
              <el-table-column prop="variant" label="规格" width="120" show-overflow-tooltip />
              <el-table-column label="操作" width="160" fixed="right">
                <template #default="{ row }">
                  <el-button text type="primary" @click="bindGoodsForCard(row)">绑卡</el-button>
                  <el-button text @click="quickBindGoods(row)">仅绑定</el-button>
                </template>
              </el-table-column>
            </el-table>
          </el-card>

          <el-table :data="bindings" border>
            <el-table-column prop="product_id" label="商品ID" width="160" />
            <el-table-column prop="product_name" label="商品名称" />
            <el-table-column prop="deliver_type" label="发货类型" width="100">
              <template #default="{ row }">
                <el-tag size="small">{{ deliverTypeText(row.deliver_type) }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="共享发卡" min-width="140">
              <template #default="{ row }">
                <span v-if="row.deliver_type === 'link_card'">测题 {{ row.psy_test_code || '-' }}</span>
                <span v-else-if="row.pool_key">{{ formatPoolKey(row.pool_key) }}</span>
                <span v-else>-</span>
              </template>
            </el-table-column>
            <el-table-column prop="stock" label="池库存" width="80" />
            <el-table-column label="自动补货" width="100">
              <template #default="{ row }">
                <el-tag v-if="row.deliver_type === 'link_card' && row.auto_replenish_enabled" type="success" size="small">
                  开 · {{ row.auto_replenish_count || 20 }}
                </el-tag>
                <span v-else-if="row.deliver_type === 'link_card'">关</span>
                <span v-else>-</span>
              </template>
            </el-table-column>
            <el-table-column label="告警" width="110">
              <template #default="{ row }">
                <el-tag v-if="row.stock <= (row.low_stock_alert ?? 10)" type="warning" size="small">低库存</el-tag>
                <el-tag
                  v-else-if="row.deliver_type === 'link_card' && cloudLowHint[row.id]"
                  type="warning"
                  size="small"
                >云端可领少</el-tag>
                <span v-else>-</span>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="260">
              <template #default="{ row }">
                <el-button text @click="openBindingDialog(row)">编辑</el-button>
                <el-button text @click="openCardDialog(row)">卡密</el-button>
                <el-button
                  v-if="row.deliver_type === 'link_card'"
                  text
                  type="success"
                  :loading="replenishingId === row.id"
                  @click="manualReplenish(row)"
                >立即补货</el-button>
                <el-button text type="danger" @click="removeBinding(row)">删除</el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-tab-pane>

        <!-- ============ 发货记录 ============ -->
        <el-tab-pane label="发货记录" name="logs">
          <div style="margin-bottom: 8px">
            <el-button size="small" @click="exportShipLogs">导出 CSV</el-button>
          </div>
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
          <el-select v-model="bindingForm.deliverType" style="width: 100%" @change="onDeliverTypeChange">
            <el-option label="激活码/卡密" value="card" />
            <el-option label="链接卡密（一单一链）" value="link_card" />
            <el-option label="固定文本" value="text" />
            <el-option label="固定网盘链接" value="link" />
            <el-option label="笔记/网址凭证" value="note" />
            <el-option label="图片" value="image" />
            <el-option label="视频" value="video" />
            <el-option label="多段组合(JSON)" value="mixed" />
            <el-option label="手动" value="manual" />
          </el-select>
          <div v-if="bindingForm.deliverType === 'link_card'" class="hint-text" style="margin-top: 6px">
            多店不同商品 ID 可选同一测题，共用云端发卡池；同一订单号只分配一次。
          </div>
        </el-form-item>
        <el-form-item v-if="bindingForm.deliverType === 'link_card'" label="心象测测题" required>
          <el-select
            v-model="bindingForm.psyTestCode"
            filterable
            clearable
            placeholder="选择测题（多商品可绑同一测题）"
            style="width: 100%"
            :loading="psyTestsLoading"
            @change="onBindTestChange"
          >
            <el-option
              v-for="t in psyTests"
              :key="t.test_code"
              :label="`${t.test_name || t.name || t.test_code} (${t.test_code})`"
              :value="t.test_code"
            />
          </el-select>
          <div class="hint-text" style="margin-top: 6px">
            已有绑定也可选同一测题以共享发卡码。未看到测题？先到「设置 → 心象测对接」登录
          </div>
        </el-form-item>
        <el-form-item v-if="bindingForm.deliverType === 'card'" label="共享卡池">
          <el-select
            v-model="bindingForm.poolKey"
            filterable
            clearable
            placeholder="新建独立卡池，或选中已有卡池共享"
            style="width: 100%"
          >
            <el-option label="新建独立卡池" value="" />
            <el-option
              v-for="p in cardSharedPools"
              :key="p.pool_key"
              :label="`${p.label} · 剩余${p.unused} · ${p.product_count}个商品`"
              :value="p.pool_key"
            />
          </el-select>
          <div class="hint-text" style="margin-top: 6px">
            多店售卖同类货时，选同一卡池；每条卡密发出后标记已用，不会再发。
          </div>
        </el-form-item>
        <el-form-item v-if="bindingForm.deliverType === 'link_card'" label="领取链接">
          <div class="bind-claim-box">
            <p class="bind-claim-lead">
              发货时按订单号向心象测领取专属链接（多店同一套码）。此处「领取进链接池」仅作库存预览，自动发货不再扣本地池。
            </p>
            <div class="bind-claim-row">
              <span>
                云端可领
                <strong v-if="bindInvLoading">…</strong>
                <strong v-else-if="!bindingForm.psyTestCode">请先选测题</strong>
                <strong v-else>{{ bindCloudInventory?.unclaimed_unused ?? '获取失败' }}</strong>
                <template v-if="bindingForm.psyTestCode && !bindInvLoading"> 条</template>
                <template v-if="bindCloudInventory && !bindInvLoading">
                  （已领未开测 {{ bindCloudInventory.claimed_unused }}）
                </template>
              </span>
              <el-input-number v-model="claimCount" :min="1" :max="200" size="small" style="width: 110px" />
              <el-button size="small" :loading="bindInvLoading" @click="refreshBindInventory">
                刷新
              </el-button>
            </div>
            <p v-if="!bindingForm.psyTestCode" class="hint-text" style="margin-top: 6px; color: #b45309">
              请先在上方选择心象测测题（如 7v7），才会显示可领条数。
            </p>
            <p v-else-if="bindInvError" class="hint-text" style="margin-top: 6px; color: #b45309">
              {{ bindInvError }}
            </p>
            <p v-else-if="bindCloudInventory && bindCloudInventory.unclaimed_unused === 0" class="hint-text" style="margin-top: 6px; color: #b45309">
              云端暂无可领链接：请先到心象测「生成链接」生成该测题，再回来领取。
            </p>
          </div>
        </el-form-item>
        <el-form-item label="发货内容">
          <el-input
            v-model="bindingForm.deliverContent"
            type="textarea"
            :rows="bindingForm.deliverType === 'link_card' ? 2 : 6"
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
        <template v-if="bindingForm.deliverType === 'link_card'">
          <el-form-item label="自动补货">
            <el-switch v-model="bindingForm.autoReplenishEnabled" active-text="开启" inactive-text="关闭" />
            <div class="hint-text" style="margin-top: 6px; width: 100%">
              池库存或云端可领 ≤ 阈值时：先调用心象测「生成链接」，再领取导入本地池并刷新展示。自动发货仍走云端按单分配。
            </div>
          </el-form-item>
          <el-form-item v-if="bindingForm.autoReplenishEnabled" label="触发阈值">
            <el-input-number v-model="bindingForm.autoReplenishThreshold" :min="0" :max="10000" />
            <span class="hint-text" style="margin-left: 8px">池库存/云端可领低于此值触发</span>
          </el-form-item>
          <el-form-item v-if="bindingForm.autoReplenishEnabled" label="每次补充">
            <el-input-number v-model="bindingForm.autoReplenishCount" :min="1" :max="50" />
            <span class="hint-text" style="margin-left: 8px">条（≤50，受云端额度限制）</span>
          </el-form-item>
          <el-form-item v-if="bindingForm.autoReplenishEnabled" label="巡检间隔">
            <el-input-number v-model="bindingForm.autoReplenishIntervalSec" :min="60" :max="86400" :step="60" />
            <span class="hint-text" style="margin-left: 8px">秒（同测题最短间隔）</span>
          </el-form-item>
        </template>
      </el-form>
      <template #footer>
        <el-button @click="showBinding = false">取消</el-button>
        <el-button :loading="claiming" @click="() => saveBinding(false)">仅保存</el-button>
        <el-button
          v-if="bindingForm.deliverType === 'link_card'"
          type="success"
          :loading="claiming"
          @click="() => saveBinding(true)"
        >
          保存并领取链接
        </el-button>
        <el-button v-else type="primary" :loading="claiming" @click="() => saveBinding(false)">保存</el-button>
      </template>
    </el-dialog>

    <!-- ============ 卡密管理弹窗 ============ -->
    <el-dialog v-model="showCards" :title="cardBindingIsLink ? '专属链接池' : '卡密池管理'" width="720px">
      <div v-if="cardBindingIsLink" class="cloud-claim-bar">
        <span>
          测题 <strong>{{ cardPsyTestCode || '未绑定' }}</strong>
          · 云端可领 <strong>{{ cloudInventory?.unclaimed_unused ?? '—' }}</strong>
          · 已领未开测 {{ cloudInventory?.claimed_unused ?? '—' }}
        </span>
        <el-input-number v-model="claimCount" :min="1" :max="200" size="small" style="width: 110px; margin-left: 12px" />
        <el-button
          type="success"
          size="small"
          style="margin-left: 8px"
          :loading="claiming"
          :disabled="!cardPsyTestCode"
          @click="claimFromCloud"
        >
          从云端领取导入
        </el-button>
        <el-button size="small" style="margin-left: 4px" :disabled="!cardPsyTestCode" @click="refreshCloudInventory">
          刷新库存
        </el-button>
      </div>
      <div class="card-toolbar">
        <el-button type="primary" @click="showCardImport = true">
          {{ cardBindingIsLink ? '批量粘贴导入' : '批量导入' }}
        </el-button>
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
        <el-table-column :prop="'card_content'" :label="cardBindingIsLink ? '专属链接' : '卡密内容'" />
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
    <el-dialog v-model="showCardImport" :title="cardImportTitle" width="560px" append-to-body>
      <el-input
        v-model="cardText"
        type="textarea"
        :rows="10"
        :placeholder="cardImportPlaceholder"
      />
      <el-checkbox v-model="skipDuplicate" style="margin-top: 8px">跳过重复{{ cardBindingIsLink ? '链接' : '卡密' }}</el-checkbox>
      <div v-if="cardBindingIsLink" class="hint-text" style="margin-top: 8px">
        示例：<br />
        https://psy.xhs365.cn/test/7v7/1rKI1KSy9tpRfxj24hTM8w<br />
        https://psy.xhs365.cn/test/7v7/FbM9K_egHN8sW5NTs1Ebdg
      </div>
      <template #footer>
        <el-button @click="showCardImport = false">取消</el-button>
        <el-button type="primary" @click="saveCards">导入</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { ProductBinding, ShipLog, CardPoolItem, OrderDelivery } from '../types/electron'
import { useShopStore } from '../stores/shop'

const shopStore = useShopStore()
const SHOP_ID = computed(() => shopStore.currentId)
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
const psyTests = ref<Array<{ test_code: string; test_name?: string; name?: string }>>([])
const psyTestsLoading = ref(false)
const claimCount = ref(20)
const claiming = ref(false)
const replenishingId = ref<number | null>(null)
const cloudInventory = ref<{ unclaimed_unused: number; claimed_unused: number; used: number } | null>(null)
const bindCloudInventory = ref<{ unclaimed_unused: number; claimed_unused: number; used: number } | null>(null)
const bindInvLoading = ref(false)
const bindInvError = ref('')
const cloudLowHint = ref<Record<number, boolean>>({})
/** 保存后自动打开链接池并领取 */
const pendingClaimAfterSave = ref(false)

const orderQuery = ref({ orderId: '', status: '' })

const syncingGoods = ref(false)
const goodsList = ref<Array<{ itemId: string; title: string; noteId?: string; price?: string; stock?: string; image?: string; variant?: string }>>([])
const goodsSyncedAt = ref('')
const selectedGoods = ref('')
/** 绑卡：保存绑定后自动打开卡密导入 */
const pendingOpenCardsAfterSave = ref(false)

const bindingForm = ref({
  productId: '',
  productName: '',
  deliverType: 'card' as 'card' | 'link_card' | 'text' | 'link' | 'note' | 'image' | 'video' | 'mixed' | 'manual',
  deliverContent: '',
  psyTestCode: '',
  poolKey: '',
  randomMode: false,
  uidLength: 10,
  sendIntervalMs: 500,
  lowStockAlert: 10,
  autoReplenishEnabled: false,
  autoReplenishThreshold: 10,
  autoReplenishCount: 20,
  autoReplenishIntervalSec: 300
})

const sharedPools = ref<
  Array<{
    pool_key: string
    label: string
    deliver_type: string
    psy_test_code: string
    unused: number
    product_count: number
  }>
>([])

const cardSharedPools = computed(() =>
  sharedPools.value.filter((p) => p.deliver_type === 'card' || !String(p.pool_key).startsWith('psy:'))
)

const formatPoolKey = (key: string) => {
  const k = String(key || '')
  if (k.startsWith('psy:')) return `测题 ${k.slice(4)}`
  if (k.startsWith('binding:')) return `独立池 #${k.slice(8)}`
  return k
}

const templateVars = [
  { key: '{订单号}', desc: '订单号' },
  { key: '{买家昵称}', desc: '买家昵称' },
  { key: '{商品名}', desc: '商品名' },
  { key: '{卡密}', desc: '卡密/专属链接' },
  { key: '{店铺名}', desc: '店铺名' },
  { key: '{uid}', desc: '随机码' },
  { key: '{ts}', desc: '时间戳' }
]

const contentPlaceholder = computed(() => {
  const map: Record<string, string> = {
    card: '如：您的激活码：{卡密}（从卡密池消耗）',
    link_card: '默认发 {卡密}（即专属链接）。也可写成：您的测评链接：{卡密}',
    text: '如：您好，{买家昵称}，感谢购买【{商品名}】',
    link: '如：https://pan.xxx.com/s/ABC123 提取码：xxxx（固定链接，不走卡密池）',
    note: '如：https://www.xiaohongshu.com/xxx（网址发货凭证，发给买家）',
    image: '图片 URL',
    video: '视频内容',
    mixed: 'JSON 数组，如 [{"type":"text","content":"你好"},{"type":"note","content":"https://..."}]',
    manual: '手动发货，无需内容'
  }
  return map[bindingForm.value.deliverType] || ''
})

const cardBindingIsLink = computed(() => {
  const row = bindings.value.find((b) => b.id === cardBindingId.value)
  return row?.deliver_type === 'link_card'
})

const cardPsyTestCode = computed(() => {
  const row = bindings.value.find((b) => b.id === cardBindingId.value)
  return (row?.psy_test_code || '').trim()
})

const cardImportTitle = computed(() =>
  cardBindingIsLink.value ? '批量导入专属链接' : '批量导入卡密'
)

const cardImportPlaceholder = computed(() =>
  cardBindingIsLink.value
    ? '每行一条专属链接，例如：\nhttps://psy.xhs365.cn/test/7v7/xxxx'
    : '每行一条卡密'
)

const deliverTypeText = (t: string) => {
  const map: Record<string, string> = {
    card: '卡密',
    link_card: '链接卡密',
    text: '文本',
    link: '固定链接',
    note: '网址凭证',
    image: '图片',
    video: '视频',
    mixed: '多段',
    manual: '手动'
  }
  return map[t] || t
}

const onDeliverTypeChange = (t: string) => {
  if (t === 'link_card' && !bindingForm.value.deliverContent.trim()) {
    bindingForm.value.deliverContent = '{卡密}'
  }
  if (t === 'card' && !bindingForm.value.deliverContent.trim()) {
    bindingForm.value.deliverContent = '您的激活码：{卡密}'
  }
  if (t === 'link_card') {
    bindingForm.value.poolKey = ''
    void loadPsyTests()
    void refreshBindInventory()
  } else {
    bindCloudInventory.value = null
    void loadSharedPools()
  }
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

const applyGoodsCache = (goods: typeof goodsList.value, syncedAt?: string) => {
  goodsList.value = Array.isArray(goods) ? goods : []
  if (syncedAt) {
    const t = Date.parse(syncedAt)
    goodsSyncedAt.value = Number.isFinite(t)
      ? new Date(t).toLocaleString('zh-CN', { hour12: false })
      : syncedAt
  } else if (goodsList.value.length) {
    goodsSyncedAt.value = goodsSyncedAt.value || ''
  } else {
    goodsSyncedAt.value = ''
  }
}

const loadCachedGoods = async () => {
  if (!window.electronAPI?.getCachedGoods) return
  try {
    const cached = await window.electronAPI.getCachedGoods(SHOP_ID.value)
    if (cached?.goods?.length) applyGoodsCache(cached.goods, cached.syncedAt)
  } catch {
    /* ignore */
  }
}

const exportShipLogs = async () => {
  const res = await window.electronAPI?.exportShipLogs()
  if (!res || res.canceled) return
  if (res.success) ElMessage.success(`已导出 ${res.count || 0} 条到 ${res.filePath}`)
  else ElMessage.warning(res.error || '导出失败')
}

const loadData = async () => {
  if (!window.electronAPI) return
  bindings.value = await window.electronAPI.listProductBindings()
  sharedPools.value = (await window.electronAPI.listSharedPools?.()) || []
  shipLogs.value = await window.electronAPI.getShipLogs(SHOP_ID.value, 100)
  const reship = await window.electronAPI.getReshipConfig(SHOP_ID.value)
  reshipEnabled.value = !!reship?.enabled
  await refreshCloudLowHints()
}

const refreshCloudLowHints = async () => {
  const next: Record<number, boolean> = {}
  if (!window.electronAPI?.psyInventory) {
    cloudLowHint.value = next
    return
  }
  const linkRows = bindings.value.filter((b) => b.deliver_type === 'link_card' && (b.psy_test_code || '').trim())
  await Promise.all(
    linkRows.map(async (b) => {
      try {
        const res = await window.electronAPI!.psyInventory(String(b.psy_test_code))
        const n = Number(res.inventory?.unclaimed_unused ?? 0)
        const alert = Number(b.low_stock_alert ?? 10)
        if (res.success && n <= alert) next[b.id] = true
      } catch {
        /* ignore */
      }
    })
  )
  cloudLowHint.value = next
}

const syncGoods = async () => {
  if (!window.electronAPI) return
  syncingGoods.value = true
  ElMessage.info({
    message: '正在打开商家后台窗口，请登录后等待自动同步（最多约 5 分钟）',
    duration: 5000
  })
  try {
    const res = await window.electronAPI.syncGoodsList()
    if (res?.success) {
      applyGoodsCache(res.goods || [], new Date().toISOString())
      ElMessage.success(`同步成功，共 ${goodsList.value.length} 个商品（已保存）`)
      if (goodsList.value.length === 0) {
        ElMessage.info('店铺暂无商品笔记，可手动添加商品 ID 后绑卡')
      }
    } else {
      ElMessage.warning({ message: res?.error || '同步失败', duration: 8000 })
    }
  } finally {
    syncingGoods.value = false
  }
}

const openArkLogin = async () => {
  syncingGoods.value = true
  ElMessage.info({
    message: '已打开商家后台：请登录，成功后会自动保存会话、同步商品并关闭窗口',
    duration: 6000
  })
  const res = await window.electronAPI?.openArkMerchant()
  if (!res?.success) {
    syncingGoods.value = false
    ElMessage.warning(res?.error || '打开失败')
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

/** 仅创建/打开绑定（发货类型默认卡密） */
const quickBindGoods = (g: { itemId: string; title: string }) => {
  pendingOpenCardsAfterSave.value = false
  editingBinding.value = null
  selectedGoods.value = g.itemId
  bindingForm.value = {
    productId: g.itemId,
    productName: g.title,
    deliverType: 'link_card',
    deliverContent: '{卡密}',
    psyTestCode: '',
    poolKey: '',
    randomMode: false,
    uidLength: 10,
    sendIntervalMs: 500,
    lowStockAlert: 10,
    autoReplenishEnabled: false,
    autoReplenishThreshold: 10,
    autoReplenishCount: 20,
    autoReplenishIntervalSec: 300
  }
  showBinding.value = true
  void loadPsyTests()
}

/** 绑定并导入卡密 */
const bindGoodsForCard = async (g: { itemId: string; title: string }) => {
  if (!window.electronAPI) return
  // 已有绑定则直接开链接池（云端领取）
  const existing = bindings.value.find((b) => b.product_id === g.itemId)
  if (existing) {
    openCardDialog(existing)
    return
  }
  pendingOpenCardsAfterSave.value = true
  pendingClaimAfterSave.value = true
  quickBindGoods(g)
}

const loadDeliveries = async () => {
  if (!window.electronAPI) return
  if (orderQuery.value.orderId) {
    const detail = await window.electronAPI.getOrderDeliveryDetail(orderQuery.value.orderId)
    deliveries.value = detail || []
    if (!detail || detail.length === 0) ElMessage.info('发货消息不存在')
  } else {
    const res = await window.electronAPI.getOrderDeliveries({ shopId: SHOP_ID.value, status: orderQuery.value.status || 'all' })
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
  await window.electronAPI?.setReshipConfig(SHOP_ID.value, { enabled: val, retryIntervalMs: 10000 })
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
  void loadSharedPools()
  if (row) {
    bindingForm.value = {
      productId: row.product_id,
      productName: row.product_name,
      deliverType: row.deliver_type as any,
      deliverContent: row.deliver_content,
      psyTestCode: row.psy_test_code || '',
      poolKey: row.pool_key || '',
      randomMode: !!row.random_mode,
      uidLength: row.uid_length ?? 10,
      sendIntervalMs: row.send_interval_ms ?? 500,
      lowStockAlert: row.low_stock_alert ?? 10,
      autoReplenishEnabled: !!row.auto_replenish_enabled,
      autoReplenishThreshold: row.auto_replenish_threshold ?? row.low_stock_alert ?? 10,
      autoReplenishCount: row.auto_replenish_count ?? 20,
      autoReplenishIntervalSec: row.auto_replenish_interval_sec ?? 300
    }
  } else {
    bindingForm.value = {
      productId: '',
      productName: '',
      deliverType: 'card',
      deliverContent: '您的激活码：{卡密}',
      psyTestCode: '',
      poolKey: '',
      randomMode: false,
      uidLength: 10,
      sendIntervalMs: 500,
      lowStockAlert: 10,
      autoReplenishEnabled: false,
      autoReplenishThreshold: 10,
      autoReplenishCount: 20,
      autoReplenishIntervalSec: 300
    }
  }
  showBinding.value = true
  if (bindingForm.value.deliverType === 'link_card') {
    void loadPsyTests()
    void refreshBindInventory()
  } else {
    bindCloudInventory.value = null
  }
}

const loadSharedPools = async () => {
  if (!window.electronAPI?.listSharedPools) {
    sharedPools.value = []
    return
  }
  try {
    sharedPools.value = (await window.electronAPI.listSharedPools()) || []
  } catch {
    sharedPools.value = []
  }
}

const clearAllBindings = () => {
  ElMessageBox.confirm(
    '将删除全部商品绑定。共享卡池中未用完的卡密也会清除（若无其它引用）。用于纠正错绑。确定？',
    '清空全部绑定',
    { type: 'warning' }
  )
    .then(async () => {
      const res = await window.electronAPI?.clearAllProductBindings?.()
      await loadData()
      ElMessage.success(`已清空 ${res?.deleted ?? 0} 条绑定`)
    })
    .catch(() => {})
}

const loadPsyTests = async () => {
  if (!window.electronAPI?.psyListTests) return
  psyTestsLoading.value = true
  try {
    const st = await window.electronAPI.psyStatus?.()
    if (st && !st.hasToken) {
      ElMessage.warning('请先到「设置 → 心象测对接」登录')
      psyTests.value = []
      return
    }
    const res = await window.electronAPI.psyListTests()
    if (res.success) {
      psyTests.value = res.tests || []
      // 未选手动测题时，按商品名自动匹配（如「七宗罪」→ 7v7）
      if (!bindingForm.value.psyTestCode.trim()) {
        const guessed = guessTestCode(bindingForm.value.productName, psyTests.value)
        if (guessed) bindingForm.value.psyTestCode = guessed
      }
      if (bindingForm.value.psyTestCode.trim()) await refreshBindInventory()
    } else if (res.message) {
      ElMessage.warning(res.message)
    }
  } finally {
    psyTestsLoading.value = false
  }
}

/** 根据商品名猜测测题 code */
function guessTestCode(
  productName: string,
  tests: Array<{ test_code: string; test_name?: string; name?: string }>
): string {
  const name = String(productName || '')
  if (!tests.length) return ''
  if (/七宗罪|七美德|\b7v7\b/i.test(name)) {
    const hit = tests.find((t) => t.test_code === '7v7')
    if (hit) return '7v7'
  }
  for (const t of tests) {
    const label = String(t.test_name || t.name || '').trim()
    if (label.length >= 2 && name.includes(label)) return t.test_code
  }
  for (const t of tests) {
    if (t.test_code && name.toLowerCase().includes(String(t.test_code).toLowerCase())) {
      return t.test_code
    }
  }
  return ''
}

const refreshBindInventory = async () => {
  const code = (bindingForm.value.psyTestCode || '').trim()
  bindInvError.value = ''
  if (!code) {
    bindCloudInventory.value = null
    bindInvError.value = '请先选择心象测测题'
    return
  }
  if (!window.electronAPI?.psyInventory) {
    bindInvError.value = '桌面接口未就绪，请重启助手'
    return
  }
  bindInvLoading.value = true
  try {
    const st = await window.electronAPI.psyStatus?.()
    if (st && !st.hasToken) {
      bindCloudInventory.value = null
      bindInvError.value = '未登录心象测，请到设置里登录后再刷新'
      return
    }
    const res = await window.electronAPI.psyInventory(code)
    if (res.success && res.inventory) {
      bindCloudInventory.value = res.inventory
      const n = Number(res.inventory.unclaimed_unused || 0)
      if (n > 0 && claimCount.value > n) claimCount.value = n
    } else {
      bindCloudInventory.value = null
      bindInvError.value = res.message || '获取云端可领数量失败'
      ElMessage.warning(bindInvError.value)
    }
  } catch (e: any) {
    bindCloudInventory.value = null
    bindInvError.value = e?.message || '获取云端可领数量失败'
    ElMessage.warning(bindInvError.value)
  } finally {
    bindInvLoading.value = false
  }
}

const onBindTestChange = () => {
  void refreshBindInventory()
}

const saveBinding = async (claimAfter = false) => {
  if (!bindingForm.value.productId) {
    ElMessage.warning('请输入商品ID')
    return
  }
  if (bindingForm.value.deliverType === 'link_card' && !bindingForm.value.psyTestCode.trim()) {
    ElMessage.warning('链接卡密请选择心象测测题')
    return
  }
  if (!window.electronAPI) {
    ElMessage.error('桌面接口未就绪，请重启发货助手')
    return
  }

  let deliverContent = bindingForm.value.deliverContent
  if (bindingForm.value.deliverType === 'link_card' && !deliverContent.trim()) {
    deliverContent = '{卡密}'
  }

  const payload = {
    shopId: SHOP_ID.value,
    productId: bindingForm.value.productId,
    productName: bindingForm.value.productName,
    deliverType: bindingForm.value.deliverType,
    deliverContent,
    psyTestCode: bindingForm.value.deliverType === 'link_card' ? bindingForm.value.psyTestCode.trim() : '',
    poolKey:
      bindingForm.value.deliverType === 'link_card'
        ? bindingForm.value.psyTestCode.trim()
          ? `psy:${bindingForm.value.psyTestCode.trim()}`
          : ''
        : bindingForm.value.poolKey || '',
    randomMode: bindingForm.value.randomMode,
    uidLength: bindingForm.value.uidLength,
    sendIntervalMs: bindingForm.value.sendIntervalMs,
    lowStockAlert: bindingForm.value.lowStockAlert,
    autoReplenishEnabled:
      bindingForm.value.deliverType === 'link_card' ? bindingForm.value.autoReplenishEnabled : false,
    autoReplenishThreshold: bindingForm.value.autoReplenishThreshold,
    autoReplenishCount: bindingForm.value.autoReplenishCount,
    autoReplenishIntervalSec: bindingForm.value.autoReplenishIntervalSec
  }

  const openCards =
    pendingOpenCardsAfterSave.value ||
    claimAfter ||
    bindingForm.value.deliverType === 'link_card'
  const doClaim = pendingClaimAfterSave.value || claimAfter
  pendingOpenCardsAfterSave.value = false
  pendingClaimAfterSave.value = false

  claiming.value = true
  try {
    let bindingId = editingBinding.value?.id || 0
    const existing = bindings.value.find((b) => b.product_id === payload.productId)

    if (editingBinding.value) {
      await window.electronAPI.updateProductBinding(editingBinding.value.id, payload)
      bindingId = editingBinding.value.id
    } else if (existing) {
      await window.electronAPI.updateProductBinding(existing.id, payload)
      bindingId = existing.id
    } else {
      bindingId = await window.electronAPI.addProductBinding(payload)
    }

    showBinding.value = false
    await loadData()
    ElMessage.success('保存成功')

    const row =
      bindings.value.find((b) => b.id === bindingId) ||
      bindings.value.find((b) => b.product_id === payload.productId)

    if ((openCards || doClaim) && row) {
      openCardDialog(row)
      if (doClaim && row.deliver_type === 'link_card') {
        await claimFromCloud()
      }
    } else if (doClaim && !row) {
      ElMessage.warning('绑定已保存，但未找到记录，请点「卡密」手动领取')
    }
  } catch (e: any) {
    ElMessage.error(e?.message || String(e) || '保存失败')
  } finally {
    claiming.value = false
  }
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
  if (row.deliver_type === 'link_card') void refreshCloudInventory()
}

const refreshCloudInventory = async () => {
  const code = cardPsyTestCode.value
  cloudInventory.value = null
  if (!code || !window.electronAPI?.psyInventory) return
  const res = await window.electronAPI.psyInventory(code)
  if (res.success && res.inventory) cloudInventory.value = res.inventory
}

const claimFromCloud = async () => {
  const code = cardPsyTestCode.value
  if (!code) {
    ElMessage.warning('请先在绑定里选择测题')
    return
  }
  if (!window.electronAPI?.psyClaimIntoPool) return
  const st = await window.electronAPI.psyStatus?.()
  if (!st?.hasToken) {
    ElMessage.info('请先登录心象测获取对接 Token')
    await window.electronAPI.psyOpenLoginWindow?.()
    return
  }
  claiming.value = true
  try {
    const row = bindings.value.find((b) => b.id === cardBindingId.value)
    const res = await window.electronAPI.psyClaimIntoPool(
      cardBindingId.value,
      code,
      claimCount.value,
      row?.product_id
    )
    if (!res.success) {
      ElMessage.error(res.message || '领取失败')
      return
    }
    ElMessage.success(res.message || `已导入 ${res.added || 0} 条`)
    await loadCards()
    await loadData()
    await refreshCloudInventory()
  } finally {
    claiming.value = false
  }
}

const manualReplenish = async (row: ProductBinding) => {
  if (!window.electronAPI?.psyAutoReplenishNow) return
  const st = await window.electronAPI.psyStatus?.()
  if (!st?.hasToken) {
    ElMessage.info('请先登录心象测获取对接 Token')
    await window.electronAPI.psyOpenLoginWindow?.()
    return
  }
  replenishingId.value = row.id
  try {
    const res = await window.electronAPI.psyAutoReplenishNow(row.id)
    if (res.added > 0 || res.generated > 0) {
      ElMessage.success(res.message || '补货完成')
    } else {
      ElMessage.warning(res.message || '未补入新链接')
    }
    await loadData()
    if (showCards.value && cardBindingId.value === row.id) {
      await loadCards()
      await refreshCloudInventory()
    }
  } finally {
    replenishingId.value = null
  }
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

let offGoodsSync: (() => void) | null = null
let offAutoReplenish: (() => void) | null = null

onMounted(async () => {
  if (window.electronAPI) {
    const config = await window.electronAPI.getAllConfig() as Record<string, unknown>
    autoShipEnabled.value = !!config.autoShipEnabled
    await loadCachedGoods()
    await loadData()
    offGoodsSync = window.electronAPI.onGoodsSyncResult((res) => {
      if (res?.success) {
        applyGoodsCache(res.goods || [], new Date().toISOString())
        syncingGoods.value = false
        ElMessage.success(`同步成功，共 ${goodsList.value.length} 个商品（已保存）`)
      } else if (res?.error) {
        syncingGoods.value = false
        ElMessage.warning({ message: res.error, duration: 8000 })
      }
    })
    offAutoReplenish = window.electronAPI.onPsyAutoReplenish?.((evt) => {
      if (!evt) return
      if (evt.added > 0 || evt.generated > 0) {
        ElMessage.success(evt.message || '自动补货完成')
        void loadData()
        if (showCards.value && cardBindingId.value === evt.bindingId) {
          void loadCards()
          void refreshCloudInventory()
        }
      }
    }) || null
  }
})

watch(
  () => shopStore.currentId,
  () => {
    void loadCachedGoods()
    void loadData()
  }
)

onUnmounted(() => {
  offGoodsSync?.()
  offGoodsSync = null
  offAutoReplenish?.()
  offAutoReplenish = null
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
.cloud-claim-bar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px;
  margin-bottom: 12px;
  padding: 10px 12px;
  background: #f0fdfa;
  border: 1px solid #99f6e4;
  border-radius: 6px;
  font-size: 13px;
  color: #0f766e;
}

.bind-claim-box {
  width: 100%;
  padding: 10px 12px;
  background: #f0fdfa;
  border: 1px solid #99f6e4;
  border-radius: 6px;
}

.bind-claim-lead {
  margin: 0 0 8px;
  font-size: 12px;
  line-height: 1.5;
  color: #0f766e;
}

.bind-claim-lead code {
  font-size: 11px;
  background: rgba(15, 118, 110, 0.08);
  padding: 0 4px;
  border-radius: 3px;
}

.bind-claim-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  font-size: 13px;
  color: #134e4a;
}
.card-stats {
  font-size: 13px;
  color: #606266;
}
</style>
