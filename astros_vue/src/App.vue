<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue';
import { RouterView } from 'vue-router';
import { useWebsocket } from './composables/useWebsocket';
import AstrosToastContainer from './components/common/AstrosToastContainer.vue';
import { useSystemStatusStore } from '@/stores/systemStatus';
import { useJobLockStore } from '@/stores/jobLock';
import { usePanicStateStore } from '@/stores/panicState';

const { wsConnect, wsDisconnect } = useWebsocket();
const systemStatusStore = useSystemStatusStore();
const jobLockStore = useJobLockStore();
const panicStateStore = usePanicStateStore();

onMounted(() => {
  // Belt-and-braces: WebSocket pushes initial state on connect, but until the
  // handshake completes there's a window where the user could see write-intent
  // controls enabled when the server is in read-only mode or while another
  // session holds the firmware-flash job lock. Fetch both up-front so the
  // banners and disabled-button bindings are correct from the first paint
  // (relevant for deep-links / hard refreshes that bypass the prior session
  // state).
  systemStatusStore.fetchStatus();
  jobLockStore.fetchLockState();
  panicStateStore.fetchPanicState();
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
