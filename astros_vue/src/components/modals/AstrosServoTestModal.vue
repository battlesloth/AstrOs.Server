<script setup lang="ts">
import { ref } from 'vue';
import { useWebsocket } from '@/composables/useWebsocket';
import type { ServoTestEvent } from '@/models/events';

const { wsSendMessage } = useWebsocket();

const props = defineProps<ServoTestEvent>();

const emit = defineEmits<{
  close: [];
}>();

const disabled = ref(true);
const label = ref('modals.servo_test.enable_test');
const value = ref(props.homePosition);

const onSliderChange = () => {
  if (disabled.value) {
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
  }
};

const enableTest = () => {
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
        <div class="text-center">{{ $t('modals.servo_test.title', { channel: channelNumber }) }}</div>
        <div class="h-5 grow"></div>
        <div class="flex flex-row items-center justify-center gap-2 mt-2">
          <input type="number" min="500" max="2500" v-model.number="value" @input="onSliderChange"
            class="input input-bordered w-24 text-center" />
          <span class="text-sm">μs</span>
        </div>
        <input type="range" min="500" max="2500" v-model.number="value" :disabled="disabled" @input="onSliderChange"
          class="range range-primary mt-4" step="1" />
      </div>
      <div class="mt-5 flex flex-row">
        <div class="grow"></div>
        <button data-testid="enable-test-button" class="btn btn-primary w-25 text-lg py-1.25 mx-1.25"
          @click="enableTest">
          {{ $t(label) }}
        </button>
        <button data-testid="close-button" class="btn w-25 text-lg py-1.25 mx-1.25" @click="closeModal">
          {{ $t('modals.servo_test.close') }}
        </button>
        <div class="grow"></div>
      </div>
    </div>
    <form method="dialog" class="modal-backdrop" @click="closeModal">
      <button>{{ $t('modals.servo_test.close') }}</button>
    </form>
  </dialog>
</template>
