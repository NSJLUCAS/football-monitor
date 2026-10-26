import { createRouter, createWebHistory } from 'vue-router'
import DashboardView from './views/DashboardView.vue'
export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: DashboardView, meta: { title: '主场' } },
    {
      path: '/node/:id(\\d+)',
      component: () => import('./views/NodeDetailView.vue'),
      meta: { title: '节点详情' },
    },
    { path: '/settings', component: () => import('./views/SettingsView.vue'), meta: { title: '主题设置' } },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
  // Query-only changes (search typing, filters) keep the scroll position.
  scrollBehavior: (to, from) =>
    to.hash ? { el: to.hash, top: 20 } : to.path === from.path ? false : { top: 0 },
})
router.afterEach((to) => {
  document.title = `${String(to.meta.title || '主场')} · Football Monitor`
})
