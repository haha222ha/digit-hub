import { createRouter, createWebHashHistory } from 'vue-router'

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    {
      path: '/',
      redirect: '/dashboard'
    },
    {
      path: '/dashboard',
      name: 'Dashboard',
      component: () => import('../views/Dashboard.vue'),
      meta: { title: '仪表盘' }
    },
    {
      path: '/license',
      name: 'License',
      component: () => import('../views/License.vue'),
      meta: { title: '授权管理' }
    },
    {
      path: '/shipping',
      name: 'Shipping',
      component: () => import('../views/Shipping.vue'),
      meta: { title: '发货管理' }
    },
    {
      path: '/auto-reply',
      name: 'AutoReply',
      component: () => import('../views/AutoReply.vue'),
      meta: { title: '自动回复' }
    },
    {
      path: '/browser',
      name: 'Browser',
      component: () => import('../views/Browser.vue'),
      meta: { title: '小红书后台' }
    },
    {
      path: '/settings',
      name: 'Settings',
      component: () => import('../views/Settings.vue'),
      meta: { title: '系统设置' }
    }
  ]
})

export default router