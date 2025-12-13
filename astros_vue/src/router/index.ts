import { createRouter, createWebHistory } from 'vue-router';
import StatusView from '../views/StatusView.vue';

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: StatusView,
    },
    {
      path: '/status',
      name: 'status',
      component: () => import('../views/StatusView.vue'),
    },
    {
      path: '/scripts',
      name: 'scripts',
      component: () => import('../views/ScriptsView.vue'),
    },
    {
      path: '/scripter',
      name: 'scripter',
      component: () => import('../views/ScripterView.vue'),
    },
    {
      path: '/remote',
      name: 'remote',
      component: () => import('../views/RemoteView.vue'),
    },
    {
      path: '/modules',
      name: 'modules',
      component: () => import('../views/ModulesView.vue'),
    },
    {
      path: '/utility',
      name: 'utility',
      component: () => import('../views/UtilityView.vue'),
    }
  ],
});

export default router;
