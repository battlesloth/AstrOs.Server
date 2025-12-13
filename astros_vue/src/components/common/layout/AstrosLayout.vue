<script setup lang="ts">
import router from '@/router';
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
</script>

<template>
  <div class="drawer">
    <input id="nav-menu-drawer" type="checkbox" class="drawer-toggle" v-model="sidebarOpen" />
    <div class="drawer-content">
      <div class="navbar bg-base-100 shadow-sm">
        <div class="flex-none pl-2 flex items-center">
          <label for="nav-menu-drawer" class="btn btn-ghost drawer-button pl-2 pr-2 h-12 ml-2">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"
              class="inline-block h-9 w-9 stroke-current">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"></path>
            </svg>
          </label>
          <a class="text-xl pl-4 lg:block">AstrOs</a>
        </div>
        <div class="flex-1"></div>
      </div>
      <slot name="main"></slot>
    </div>
    <div class="drawer-side">
      <label for="nav-menu-drawer" aria-label="close sidebar" class="drawer-overlay"></label>
      <div class="bg-base-200 min-h-full w-80">
        <ul class="menu w-80 p-4">
          <li>
            <p @click="router.push('/status')">Status</p>
          </li>
          <li>
            <p @click="router.push('/pixi')">Pixi</p>
          </li>
        </ul>
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
