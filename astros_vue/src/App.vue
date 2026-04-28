<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue';
import { RouterView } from 'vue-router';
import { useWebsocket } from './composables/useWebsocket';
import AstrosToastContainer from './components/common/AstrosToastContainer.vue';
import { useSystemStatusStore } from '@/stores/systemStatus';

const { wsConnect, wsDisconnect } = useWebsocket();
const systemStatusStore = useSystemStatusStore();

onMounted(() => {
  // Belt-and-braces: WebSocket pushes initial state on connect, but until the
  // handshake completes there's a window where the user could see write-intent
  // controls enabled when the server is in read-only mode. Fetch once up-front
  // so the banner and disabled-button bindings are correct from the first paint.
  systemStatusStore.fetchStatus();
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
        <component
          :is="Component"
          :key="$route.path"
        ></component>
      </template>
      <template #fallback>
        <div>Loading...</div>
      </template>
    </suspense>
  </router-view>
  <AstrosToastContainer />
</template>

<style scoped></style>
