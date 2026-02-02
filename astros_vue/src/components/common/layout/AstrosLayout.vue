<script setup lang="ts">
import router from '@/router';
import apiService from '@/api/apiService';
import { ref, watch } from 'vue';

const props = defineProps({
  isSidebarOpen: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits(['update:isSidebarOpen']);

const sidebarOpen = ref(props.isSidebarOpen);

// Watch for changes in the prop and update local state
watch(
  () => props.isSidebarOpen,
  (newVal) => {
    sidebarOpen.value = newVal;
  },
);

// Watch for changes in local state and emit to parent
watch(sidebarOpen, (newVal) => {
  emit('update:isSidebarOpen', newVal);
});

function logout() {
  apiService.clearToken();
  router.push('/auth');
}
</script>

<template>
  <div class="drawer">
    <input
      id="nav-menu-drawer"
      type="checkbox"
      class="drawer-toggle"
      v-model="sidebarOpen"
      aria-label="open sidebar"
      aria-controls="sidebar-menu"
    />
    <div class="drawer-content">
      <div class="navbar bg-base-100 shadow-sm">
        <div class="flex-none pl-2 flex items-center">
          <label
            for="nav-menu-drawer"
            class="btn btn-ghost drawer-button pl-2 pr-2 h-12 ml-2"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              class="inline-block h-9 w-9 stroke-current"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M4 6h16M4 12h16M4 18h16"
              ></path>
            </svg>
          </label>
          <div class="font-starwars pt-1.5 pl-4 lg:block">
            <span class="text-3xl">A</span>
            <span class="text-2xl">str</span>
            <span class="text-3xl">O</span>
            <span class="text-2xl">s</span>
          </div>
        </div>
        <div class="flex-1"></div>
      </div>
      <slot name="main"></slot>
    </div>
    <div class="drawer-side">
      <label
        for="nav-menu-drawer"
        aria-label="close sidebar"
        class="drawer-overlay"
      ></label>
      <div class="bg-base-200 min-h-full w-80">
        <nav aria-label="Main menu">
          <ul class="menu w-80 p-4 text-2xl">
            <li>
              <router-link to="/status">{{ $t('nav.status') }}</router-link>
            </li>
            <li>
              <router-link to="/scripts">{{ $t('nav.scripts') }}</router-link>
            </li>
            <li>
              <router-link to="/remote">{{ $t('nav.remote') }}</router-link>
            </li>
            <li>
              <router-link to="/modules">{{ $t('nav.modules') }}</router-link>
            </li>
            <li>
              <router-link to="/utility">{{ $t('nav.utility') }}</router-link>
            </li>
            <li>
              <button @click="logout">{{ $t('nav.logout') }}</button>
            </li>
          </ul>
        </nav>
      </div>
    </div>
  </div>
</template>

<style scoped>
.drawer-content {
  display: flex;
  flex-direction: column;
  height: 100vh;
}

.navbar {
  flex-shrink: 0;
}
</style>
