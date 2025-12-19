<script setup lang="ts">
import { ref, watch, type PropType } from 'vue';
import type { UartModule } from '@/models/controllers/modules/uart/uartModule';

const props = defineProps({
  module: {
    type: Object as PropType<UartModule>,
    required: true,
  },
  parentTestId: {
    type: String,
    required: true,
  },
  isMaster: {
    type: Boolean,
    default: false,
  },
});

const uartChannel = ref<string>('');
const baudRate = ref<string>('');

watch(
  () => props.module,
  (newModule) => {
    if (newModule) {
      uartChannel.value = newModule.uartChannel.toString();
      baudRate.value = newModule.baudRate.toString();
    }
  },
  { immediate: true },
);

const onChannelChange = (val: string) => {
  props.module.uartChannel = parseInt(val);
};

const onBaudRateChange = (val: string) => {
  props.module.baudRate = parseInt(val);
};
</script>

<template>
  <div class="flex flex-row gap-5">
    <select :data-testid="`${parentTestId}-hcr-serial-uart-channel`" v-model="uartChannel"
      @change="onChannelChange(uartChannel)" class="select select-bordered select-sm w-30">
      <option v-if="!isMaster" value="1">{{ $t('uart.channel_1') }}</option>
      <option value="2">{{ $t('uart.channel_2') }}</option>
    </select>
    <select :data-testid="`${parentTestId}-hcr-serial-baud`" v-model="baudRate" @change="onBaudRateChange(baudRate)"
      class="select select-bordered select-sm w-30">
      <option value="9600">{{ $t('uart.baudrates.9600') }}</option>
      <option value="19200">{{ $t('uart.baudrates.19200') }}</option>
      <option value="38400">{{ $t('uart.baudrates.38400') }}</option>
      <option value="57600">{{ $t('uart.baudrates.57600') }}</option>
      <option value="115200">{{ $t('uart.baudrates.115200') }}</option>
    </select>
  </div>
</template>
