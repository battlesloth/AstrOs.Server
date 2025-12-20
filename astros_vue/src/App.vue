<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue';
import { RouterView } from 'vue-router';
import { useWebsocket } from './composables/useWebsocket';

const { wsConnect, wsDisconnect } = useWebsocket();
onMounted(() => {
  wsConnect();
});

onUnmounted(() => {
  wsDisconnect();
});

</script>
<template>
  <router-view v-slot="{ Component }">
    <suspense timeout="0">
      <template #default>
        <component :is="Component" :key="$route.path"></component>
      </template>
      <template #fallback>
        <div>Loading...</div>
      </template>
    </suspense>
  </router-view>
</template>

<style scoped></style>
