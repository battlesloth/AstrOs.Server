<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { RouterView } from 'vue-router';
import { useWebsocketReceiver } from './composables/useWebsocketReceiver';

const ws = ref<WebSocket | null>(null);
const isConnected = ref(false);
const retryInterval = 3000;
let retryTimeout: number | null = null;

const { handleMessage } = useWebsocketReceiver();

const connectWebSocket = () => {
  ws.value = new WebSocket('ws://localhost:5000/ws');

  ws.value.onopen = () => {
    isConnected.value = true;
    console.log('WebSocket connected');
    if (retryTimeout) {
      clearTimeout(retryTimeout);
      retryTimeout = null;
    }
  };

  ws.value.onclose = () => {
    isConnected.value = false;
    console.log('WebSocket disconnected, retrying in 3 seconds...');
    attemptReconnect();
  };

  ws.value.onerror = (error) => {
    console.error('WebSocket error:', error);
    ws.value?.close();
  };

  ws.value.onmessage = (event) => {
    handleMessage(event.data);
  };
};

const attemptReconnect = () => {
  if (!isConnected.value) {
    retryTimeout = window.setTimeout(connectWebSocket, retryInterval);
  }
};

onMounted(() => {
  connectWebSocket();
});

onUnmounted(() => {
  if (ws.value) {
    ws.value.close();
  }
  if (retryTimeout) {
    window.clearTimeout(retryTimeout);
  }
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
