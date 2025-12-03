import { createRouter, createWebHistory } from 'vue-router'
import StatusView from '../views/StatusView.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: StatusView
    },
    {
      path: '/status',
      name: 'status',
      component: () => import('../views/StatusView.vue')
    },
    {
      path: '/pixi',
      name: 'pixi',
      component: () => import('../views/PixiView.vue')
    }
  ],
})

export default router
