<script setup lang="ts">
import { AstrosLayout, AstrosStatus } from '@/components';
import { useControllerStore } from '@/stores/controller';
import { usePanicStateStore } from '@/stores/panicState';
import { useRemoteCommands } from '@/composables/useRemoteCommands';
import { useToast } from '@/composables/useToast';
import { useI18n } from 'vue-i18n';
import { storeToRefs } from 'pinia';

const controllerStore = useControllerStore();

const bodyStatus = storeToRefs(controllerStore).bodyStatus;
const domeStatus = storeToRefs(controllerStore).domeStatus;
const coreStatus = storeToRefs(controllerStore).coreStatus;

const { inPanicStop } = storeToRefs(usePanicStateStore());
const commands = useRemoteCommands();
const toast = useToast();
const { t } = useI18n();

async function onClearPanic() {
  const result = await commands.panicClear();
  if (!result.success) {
    toast.error(t('statusPage.clear_panic_failed'));
  }
}
</script>

<template>
  <AstrosLayout>
    <template v-slot:main>
      <div class="h-full justify-center items-center flex flex-col">
        <AstrosStatus
          :bodyStatus="bodyStatus"
          :domeStatus="domeStatus"
          :coreStatus="coreStatus"
        />
        <!-- Recovery affordance: appears only when the server queue is panicked
             (any client may have triggered it). A deliberate click clears it. -->
        <div
          v-if="inPanicStop"
          class="mt-6 flex flex-col items-center gap-2"
        >
          <p class="text-error font-semibold">{{ $t('statusPage.panicked_hint') }}</p>
          <button
            class="btn btn-error"
            data-testid="clear-panic"
            @click="onClearPanic"
          >
            {{ $t('statusPage.clear_panic') }}
          </button>
        </div>
      </div>
    </template>
  </AstrosLayout>
</template>
