import { createRouter, createWebHistory } from 'vue-router';
import StatusView from '../views/StatusView.vue';
import api from '@/api/apiService';
import { CHECK_SESSION } from '@/api/enpoints';

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: StatusView,
    },
    {
      path: '/auth',
      name: 'auth',
      component: () => import('../views/AuthView.vue'),
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
    },
  ],
});

router.beforeEach(async (to, from, next) => {
  if (!to.meta.public && to.path !== '/auth') {
    // Check if we have a token first
    const token = api.getToken();
    if (!token) {
      console.log('No token found, redirecting to auth');
      next('/auth');
      return;
    }

    // Check if the route requires authentication
    try {
      const response = await api.get(CHECK_SESSION);
      console.log('Session check response:', response);
      if (response.isAuthenticated) {
        next();
      } else {
        next('/auth');
      }
    } catch (error) {
      console.error('Session check failed:', error);
      next('/auth');
    }
  } else {
    next();
  }
});

export default router;
