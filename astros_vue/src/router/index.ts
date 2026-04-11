import { createRouter, createWebHistory } from 'vue-router';
import StatusView from '../views/StatusView.vue';
import api from '@/api/apiService';
import { CHECK_SESSION } from '@/api/endpoints';

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
      path: '/scripter/:id',
      name: 'scripter',
      component: () => import('../views/ScripterView.vue'),
    },
    {
      path: '/playlists',
      name: 'playlists',
      component: () => import('../views/PlaylistsView.vue'),
    },
    {
      path: '/playlist/:id',
      name: 'playlist',
      component: () => import('../views/PlaylistEditorView.vue'),
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
      path: '/modules/:skipControllers',
      name: 'modules-skip-controllers',
      component: () => import('../views/ModulesView.vue'),
    },
    {
      path: '/utility',
      name: 'utility',
      component: () => import('../views/UtilityView.vue'),
    },
  ],
});

const SESSION_CHECK_TTL_MS = 60_000;
let lastSessionCheckAt = 0;

router.beforeEach(async (to, from, next) => {
  if (!to.meta.public && to.path !== '/auth') {
    // Check if we have a token first
    const token = api.getToken();
    if (!token) {
      console.log('No token found, redirecting to auth');
      lastSessionCheckAt = 0;
      next('/auth');
      return;
    }

    // Skip the API round-trip if we recently verified the session
    if (Date.now() - lastSessionCheckAt < SESSION_CHECK_TTL_MS) {
      next();
      return;
    }

    // Check if the route requires authentication
    try {
      const response = await api.get(CHECK_SESSION);
      console.log('Session check response:', response);
      if (response.isAuthenticated) {
        lastSessionCheckAt = Date.now();
        next();
      } else {
        lastSessionCheckAt = 0;
        next('/auth');
      }
    } catch (error) {
      console.error('Session check failed:', error);
      lastSessionCheckAt = 0;
      next('/auth');
    }
  } else {
    next();
  }
});

export default router;
