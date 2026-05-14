<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useWebsocket } from '@/composables/useWebsocket';
import { useJobLockStore } from '@/stores/jobLock';
import { useSystemStatusStore } from '@/stores/systemStatus';
import { storeToRefs } from 'pinia';
import type { ServoTestEvent } from '@/models/events';
import AstrosWriteButton from '@/components/common/AstrosWriteButton.vue';

const { wsSendMessage } = useWebsocket();
const jobLock = useJobLockStore();
const { locked: jobLockLocked } = storeToRefs(jobLock);
const systemStatus = useSystemStatusStore();
const { readOnly: systemStatusReadOnly } = storeToRefs(systemStatus);

const props = defineProps<ServoTestEvent>();

const emit = defineEmits<{
  close: [];
}>();

const disabled = ref(true);
const label = ref('modals.servo_test.enable_test');
const value = ref(props.homePosition);

// Value-entry write gate + belt-and-suspenders for the handler bodies.
// The Enable Test button itself is handled by AstrosWriteButton, which
// consults both stores directly. This computed mirrors that OR so the
// number-input :disabled, the slider :disabled, onSliderChange's
// early-return, enableTest's early-return, and the mid-session
// auto-disable watcher all stay in sync. The handler-body guards
// protect against any programmatic invocation path that bypasses the
// elements' disabled state.
//
// Note: the firmware-flash notice region (`lock-active-notice` below) is
// intentionally gated on `jobLockLocked` alone, not `writesBlocked`. Its
// copy is firmware-flash-specific (firmware_view.lock_active); readonly
// is surfaced elsewhere in the UI through AstrosWriteButton's tooltip
// (whichever priority that component currently assigns), so a redundant
// "flash active" notice during a non-flash readonly state would be
// misleading. If AstrosWriteButton ever drops its readonly tooltip, this
// modal will need its own readonly notice copy.
const writesBlocked = computed(() => jobLockLocked.value || systemStatusReadOnly.value);

// If writes become blocked (firmware flash lock or system readonly) while
// the modal is already open with the test active, auto-disable so further
// slider/input is ignored locally as well — AND when the block later
// releases, the test stays disabled until the operator explicitly
// re-Enables it (the handler-body guards no longer short-circuit once
// writesBlocked is false again, so without resetting disabled.value
// here, the next slider input would re-emit SERVO_TEST unexpectedly).
watch(writesBlocked, (nowBlocked) => {
  if (nowBlocked && !disabled.value) {
    disabled.value = true;
    label.value = 'modals.servo_test.enable_test';
  }
});

const onSliderChange = () => {
  if (disabled.value || writesBlocked.value) {
    return;
  }
  wsSendMessage(JSON.stringify(servoTestMessage()));
};

function servoTestMessage() {
  return {
    msgType: 'SERVO_TEST',
    data: {
      controllerAddress: props.controllerAddress,
      controllerName: props.controllerName,
      moduleSubType: props.moduleSubType,
      moduleIdx: props.moduleIdx,
      channelNumber: props.channelNumber,
      value: value.value,
    },
  };
}

const enableTest = () => {
  if (writesBlocked.value) return;
  disabled.value = !disabled.value;
  if (!disabled.value) {
    label.value = 'modals.servo_test.disable_test';
    wsSendMessage(JSON.stringify(servoTestMessage()));
  } else {
    label.value = 'modals.servo_test.enable_test';
  }
};

const closeModal = () => {
  emit('close');
};
</script>

<template>
  <dialog class="modal modal-open">
    <div class="modal-box w-75">
      <div class="flex flex-col text-lg">
        <div class="text-center">
          {{ $t('modals.servo_test.title', { channel: channelNumber }) }}
        </div>
        <div class="h-5 grow"></div>
        <div class="flex flex-row items-center justify-center gap-2 mt-2">
          <input
            type="number"
            min="500"
            max="2500"
            v-model.number="value"
            :disabled="disabled || writesBlocked"
            @input="onSliderChange"
            class="input input-bordered w-24 text-center"
          />
          <span class="text-sm">μs</span>
        </div>
        <input
          type="range"
          min="500"
          max="2500"
          v-model.number="value"
          :disabled="disabled || writesBlocked"
          @input="onSliderChange"
          class="range range-primary mt-4"
          step="1"
        />
        <div
          v-if="jobLockLocked"
          role="status"
          aria-live="polite"
          class="text-sm text-warning text-center mt-2"
          data-testid="lock-active-notice"
        >
          {{ $t('firmware_view.lock_active') }}
        </div>
      </div>
      <div class="mt-5 flex flex-row">
        <div class="grow"></div>
        <AstrosWriteButton
          data-testid="enable-test-button"
          class="btn btn-primary w-25 text-lg py-1.25 mx-1.25"
          @click="enableTest"
        >
          {{ $t(label) }}
        </AstrosWriteButton>
        <button
          data-testid="close-button"
          class="btn w-25 text-lg py-1.25 mx-1.25"
          @click="closeModal"
        >
          {{ $t('modals.servo_test.close') }}
        </button>
        <div class="grow"></div>
      </div>
    </div>
    <form
      method="dialog"
      class="modal-backdrop"
      @click="closeModal"
    >
      <button>{{ $t('modals.servo_test.close') }}</button>
    </form>
  </dialog>
</template>
