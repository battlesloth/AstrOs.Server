<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { storeToRefs } from 'pinia';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import apiService from '@/api/apiService';
import { useToast } from '@/composables/useToast';
import { useWebsocket } from '@/composables/useWebsocket';
import { useRemoteCommands } from '@/composables/useRemoteCommands';
import { useControllerStore } from '@/stores/controller';
import { useRemoteControlStore } from '@/stores/remoteControl';
import AstrosMobileTopBar from '@/components/mobileRemote/mobileTopBar/AstrosMobileTopBar.vue';
import AstrosMobileRemote from '@/components/mobileRemote/mobileRemote/AstrosMobileRemote.vue';
import AstrosMobileStatus from '@/components/mobileRemote/mobileStatus/AstrosMobileStatus.vue';
import type { AstrosMobileRemotePressEvent } from '@/components/mobileRemote/mobileRemote/types';
import type { MobileScreen } from '@/components/mobileRemote/mobileTopBar/types';

const router = useRouter();
const toast = useToast();
const { t } = useI18n();
const commands = useRemoteCommands();

const { wsIsConnected } = useWebsocket();
const { domeStatus, coreStatus, bodyStatus } = storeToRefs(useControllerStore());

const remoteStore = useRemoteControlStore();
const { remoteControlPages } = storeToRefs(remoteStore);

const screen = ref<MobileScreen>('remote');

onMounted(async () => {
  // loadRemoteControl logs its own errors and never throws. On success with an
  // empty saved config it seeds one default page; on a real failure it leaves
  // pages empty (the grid shows its "no pages" state). Surface the failure so
  // an empty remote reads as "load failed", not "unconfigured".
  const result = await remoteStore.loadRemoteControl();
  if (!result.success) {
    toast.error(t('mobile.config_load_failed'));
  }
});

function toggleScreen() {
  screen.value = screen.value === 'remote' ? 'status' : 'remote';
}

// The remote grid shows an optimistic "sent" toast on press, so a swallowed
// command failure would falsely tell the operator the droid got the command.
// Surface failures as an error toast.
async function onPress(button: AstrosMobileRemotePressEvent) {
  const result =
    button.type === 'script'
      ? await commands.runScript(button.id)
      : await commands.runPlaylist(button.id);
  if (!result.success) {
    toast.error(t('mobile.command_failed', { name: button.name }));
  }
}

async function onPanic() {
  const result = await commands.panicStop();
  if (!result.success) {
    // Longer-lived: this is the emergency stop — a failed stop must not be missed.
    toast.error(t('mobile.panic_failed'), 6000);
  }
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
