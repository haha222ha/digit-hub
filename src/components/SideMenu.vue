<template>
  <div class="sidebar" v-if="show">
    <div class="menu">
      <div
        v-for="item in menuItems"
        :key="item.path"
        class="menu-item"
        :class="{ active: currentPath === item.path }"
        @click="navigate(item.path)"
      >
        <el-icon :size="18"><component :is="item.icon" /></el-icon>
        <span>{{ item.title }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import {
  HomeFilled, Goods, ChatDotRound, Monitor, Setting, Key
} from '@element-plus/icons-vue'

const router = useRouter()
const route = useRoute()
const show = ref(true)

const menuItems = [
  { path: '/dashboard', title: '仪表盘', icon: HomeFilled },
  { path: '/shipping', title: '发货管理', icon: Goods },
  { path: '/auto-reply', title: '自动回复', icon: ChatDotRound },
  { path: '/browser', title: '客服工作台', icon: Monitor },
  { path: '/license', title: '授权管理', icon: Key },
  { path: '/settings', title: '系统设置', icon: Setting }
]

const currentPath = computed(() => route.path)

const navigate = (path: string) => {
  router.push(path)
}
</script>

<style scoped>
.sidebar {
  width: 180px;
  background: #fff;
  border-right: 1px solid #e4e7ed;
  padding: 12px 0;
  height: 100%;
}

.menu {
  display: flex;
  flex-direction: column;
}

.menu-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 20px;
  cursor: pointer;
  color: #606266;
  transition: all 0.2s;
  font-size: 14px;
}

.menu-item:hover {
  background: #f5f7fa;
  color: #409eff;
}

.menu-item.active {
  background: #ecf5ff;
  color: #409eff;
  border-right: 3px solid #409eff;
}
</style>