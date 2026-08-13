<template>
  <div class="auto-reply page-container">
    <div class="card">
      <div class="header">
        <h2 class="page-title">自动回复</h2>
        <div class="header-actions">
          <el-switch v-model="autoReplyEnabled" active-text="开启自动回复" @change="toggleAutoReply" />
          <el-button @click="openKefu" style="margin-left: 12px">打开客服窗口</el-button>
        </div>
      </div>

      <el-button type="primary" @click="showAddRule = true" style="margin-bottom: 16px">
        添加回复规则
      </el-button>

      <el-table :data="replyRules" border>
        <el-table-column prop="keyword" label="触发关键词" />
        <el-table-column prop="reply_text" label="回复内容" />
        <el-table-column prop="reply_type" label="类型" width="100">
          <template #default="{ row }">
            <el-tag size="small">{{ getTypeText(row.reply_type) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="row.enabled ? 'success' : 'info'" size="small">
              {{ row.enabled ? '启用' : '禁用' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="150">
          <template #default="{ row }">
            <el-button text @click="editRule(row)">编辑</el-button>
            <el-button text type="danger" @click="deleteRule(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <el-dialog v-model="showAddRule" :title="editingRule ? '编辑规则' : '添加规则'" width="500px">
      <el-form :model="ruleForm" label-width="100px">
        <el-form-item label="触发关键词">
          <el-input v-model="ruleForm.keyword" placeholder="如：发货了吗" />
        </el-form-item>
        <el-form-item label="回复类型">
          <el-select v-model="ruleForm.reply_type">
            <el-option label="文本" value="text" />
            <el-option label="图片" value="image" />
            <el-option label="卡片" value="card" />
          </el-select>
        </el-form-item>
        <el-form-item label="回复内容">
          <el-input v-model="ruleForm.reply_text" type="textarea" :rows="4" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showAddRule = false">取消</el-button>
        <el-button type="primary" @click="saveRule">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { ReplyRule } from '../types/electron'

const SHOP_ID = 'default'
const autoReplyEnabled = ref(false)
const showAddRule = ref(false)
const editingRule = ref<ReplyRule | null>(null)
const replyRules = ref<ReplyRule[]>([])

const ruleForm = ref({ keyword: '', reply_text: '', reply_type: 'text' })

const getTypeText = (type: string) => {
  const map: Record<string, string> = { text: '文本', image: '图片', card: '卡片' }
  return map[type] || type
}

const loadRules = async () => {
  if (!window.electronAPI) return
  replyRules.value = await window.electronAPI.listReplyRules(SHOP_ID)
}

const toggleAutoReply = async (val: boolean) => {
  await window.electronAPI?.setConfig('autoReplyEnabled', val)
  ElMessage.success(`自动回复已${val ? '开启' : '关闭'}`)
}

const openKefu = async () => {
  await window.electronAPI?.openKefuWindow()
  ElMessage.success('客服窗口已打开')
}

const editRule = (row: ReplyRule) => {
  editingRule.value = row
  ruleForm.value = { keyword: row.keyword, reply_text: row.reply_text, reply_type: row.reply_type }
  showAddRule.value = true
}

const deleteRule = (row: ReplyRule) => {
  ElMessageBox.confirm('确定删除此规则？', '提示', { type: 'warning' })
    .then(async () => {
      await window.electronAPI?.deleteReplyRule(row.id)
      await loadRules()
      ElMessage.success('已删除')
    })
    .catch(() => {})
}

const saveRule = async () => {
  if (!ruleForm.value.keyword || !ruleForm.value.reply_text) {
    ElMessage.warning('请填写完整')
    return
  }
  if (!window.electronAPI) return

  if (editingRule.value) {
    await window.electronAPI.updateReplyRule(editingRule.value.id, ruleForm.value)
    editingRule.value = null
  } else {
    await window.electronAPI.addReplyRule({
      shopId: SHOP_ID,
      keyword: ruleForm.value.keyword,
      replyText: ruleForm.value.reply_text,
      replyType: ruleForm.value.reply_type
    })
  }

  showAddRule.value = false
  ruleForm.value = { keyword: '', reply_text: '', reply_type: 'text' }
  await loadRules()
  ElMessage.success('保存成功')
}

onMounted(async () => {
  if (window.electronAPI) {
    const config = await window.electronAPI.getAllConfig() as Record<string, unknown>
    autoReplyEnabled.value = !!config.autoReplyEnabled
    await loadRules()

    window.electronAPI.onKefuMessage((data) => {
      console.log('[AutoReply] 收到客服消息:', data)
    })
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
</style>
