<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { storeToRefs } from 'pinia';
import { useRouter } from 'vue-router';
import apiService from '@/api/apiService';
import { useWebsocket } from '@/composables/useWebsocket';
import { useRemoteCommands } from '@/composables/useRemoteCommands';
import { useControllerStore } from '@/stores/controller';
import { useRemoteControlStore } from '@/stores/remoteControl';
import AstrosMobileTopBar from '@/components/mobileRemote/mobileTopBar/AstrosMobileTopBar.vue';
import AstrosMobileRemote from '@/components/mobileRemote/mobileRemote/AstrosMobileRemote.vue';
import AstrosMobileStatus from '@/components/mobileRemote/mobileStatus/AstrosMobileStatus.vue';
import type { AstrosMobileRemotePressEvent } from '@/components/mobileRemote/mobileRemote/types';

const router = useRouter();
const commands = useRemoteCommands();

const { wsIsConnected } = useWebsocket();
const { domeStatus, coreStatus, bodyStatus } = storeToRefs(useControllerStore());

const remoteStore = useRemoteControlStore();
const { remoteControlPages } = storeToRefs(remoteStore);

const screen = ref<'remote' | 'status'>('remote');

onMounted(() => {
  // Store swallows its own errors and seeds a default page on failure, so the
  // remote always has something to render.
  remoteStore.loadRemoteControl();
});

function toggleScreen() {
  screen.value = screen.value === 'remote' ? 'status' : 'remote';
}

function onPress(button: AstrosMobileRemotePressEvent) {
  if (button.type === 'script') {
    commands.runScript(button.id);
  } else {
    commands.runPlaylist(button.id);
  }
}

function onPanic() {
  commands.panicStop();
}

function onLogout() {
  apiService.clearToken();
  router.push('/auth');
}
</script>

<template>
  <div class="mobile-remote-view">
    <AstrosMobileTopBar
      :connected="wsIsConnected"
      :screen="screen"
      @toggle="toggleScreen"
    />

    <main class="mobile-remote-view__screen">
      <AstrosMobileRemote
        v-if="screen === 'remote'"
        :pages="remoteControlPages"
        :show-top-bar="false"
        @press="onPress"
        @panic="onPanic"
      />
      <AstrosMobileStatus
        v-else
        :dome-status="domeStatus"
        :core-status="coreStatus"
        :body-status="bodyStatus"
        @logout="onLogout"
      />
    </main>
  </div>
</template>

<style scoped>
/* Shared mobile palette ("Direction B" handoff). Defined on the shell root so
 * the top bar and status panel inherit via CSS custom-property cascade;
 * AstrosMobileRemote carries its own copy and is unaffected. */
.mobile-remote-view {
  --mr-primary: #2a5a97;
  --mr-primary-hover: #2f445c;
  --mr-complement: #f49446;
  --mr-base-100: #ffffff;
  --mr-base-200: #f2f7fa;
  --mr-ink: #0e1726;
  --mr-ink-soft: #4b5b73;
  --mr-border: #d6e0e6;
  --mr-border-strong: #9bb1bd;
  --mr-success: #3aa676;
  --mr-panic-idle: #c91f1f;
  --mr-panic-active: #7a1717;

  display: flex;
  flex-direction: column;
  width: 100%;
  /* dvh tracks the mobile browser's shrinking/growing chrome; vh is the
   * fallback for browsers without dynamic-viewport units. */
  height: 100vh;
  height: 100dvh;
  overflow: hidden;
  background: var(--mr-base-100);
}

.mobile-remote-view__screen {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
}
</style>
