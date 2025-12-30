<script setup lang="ts">
import { ref, watch, type PropType } from 'vue';
import type { UartModule } from '@/models/controllers/modules/uart/uartModule';
import type { KangarooModule } from '@/models/controllers/modules/uart/subModules/kangarooX2/kangarooModule';

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

// Reactive state
const uartChannel = ref<string>('');
const baudRate = ref<string>('');
const subModule = ref<KangarooModule | null>(null);

// Watch for module changes
watch(
  () => props.module,
  (newModule) => {
    if (newModule) {
      uartChannel.value = newModule.uartChannel.toString();
      baudRate.value = newModule.baudRate.toString();
      subModule.value = newModule.subModule as KangarooModule;
    }
  },
  { immediate: true },
);

// Methods
const onChannelChange = (val: string) => {
  props.module.uartChannel = parseInt(val);
};

const onBaudRateChange = (val: string) => {
  props.module.baudRate = parseInt(val);
};
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-row gap-5">
      <select
        :data-testid="`${parentTestId}-kangaroo-uart-channel`"
        v-model="uartChannel"
        @change="onChannelChange(uartChannel)"
        class="select select-bordered select-sm w-30"
      >
        <option
          v-if="!isMaster"
          value="1"
        >
          {{ $t('uart.channel_1') }}
        </option>
        <option value="2">{{ $t('uart.channel_2') }}</option>
      </select>
      <select
        :data-testid="`${parentTestId}-kangaroo-baud`"
        v-model="baudRate"
        @change="onBaudRateChange(baudRate)"
        class="select select-bordered select-sm w-30"
      >
        <option value="9600">{{ $t('uart.baudrates.9600') }}</option>
        <option value="19200">{{ $t('uart.baudrates.19200') }}</option>
        <option value="38400">{{ $t('uart.baudrates.38400') }}</option>
        <option value="57600">{{ $t('uart.baudrates.57600') }}</option>
        <option value="115200">{{ $t('uart.baudrates.115200') }}</option>
      </select>
    </div>
    <div
      v-if="subModule"
      class="grid grid-cols-1 md:grid-cols-2 gap-4"
    >
      <div class="flex items-center gap-2">
        <label class="label-text font-medium min-w-20">{{ $t('uart.channel_1') }}</label>
        <input
          :data-testid="`${parentTestId}-kangaroo-ch1Name`"
          v-model="subModule.ch1Name"
          :placeholder="$t('uart.channel_1')"
          class="input input-bordered input-sm grow"
        />
      </div>
      <div class="flex items-center gap-2">
        <label class="label-text font-medium min-w-20">{{ $t('uart.channel_2') }}</label>
        <input
          :data-testid="`${parentTestId}-kangaroo-ch2Name`"
          v-model="subModule.ch2Name"
          :placeholder="$t('uart.channel_2')"
          class="input input-bordered input-sm grow"
        />
      </div>
    </div>
  </div>
</template>
