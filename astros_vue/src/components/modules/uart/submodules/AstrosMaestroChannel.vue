<script setup lang="ts">
import { computed } from 'vue';
import AstrosServoSettings from '../../shared/AstrosServoSettings.vue';
import { ModuleSubType } from '@/enums/modules/ModuleSubType';
import type { ServoTestEvent } from '@/models/events';

// MaestroChannel interface
interface MaestroChannel {
  id: string;
  channelNumber: number;
  enabled: boolean;
  channelName: string;
  isServo: boolean;
  inverted: boolean;
  minPos: number;
  maxPos: number;
  homePos: number;
}

const channel = defineModel<MaestroChannel>('channel', { required: true });

// Props
defineProps({
  parentTestId: {
    type: String,
    required: true,
  },
});

// Emits
const emit = defineEmits<{
  servoTest: [event: ServoTestEvent];
}>();

// Computed
const type = computed({
  get: () => {
    if (!channel.value.enabled) return '0';
    return channel.value.isServo ? '1' : '2';
  },
  set: (val: string) => {
    switch (val) {
      case '0':
        channel.value = { ...channel.value, enabled: false };
        break;
      case '1':
        channel.value = { ...channel.value, enabled: true, isServo: true };
        break;
      case '2':
        channel.value = { ...channel.value, enabled: true, isServo: false };
        break;
    }
  },
});

// Methods
const testServoModal = () => {
  emit('servoTest', {
    controllerAddress: '',
    controllerName: '',
    moduleSubType: ModuleSubType.MAESTRO,
    moduleIdx: -1,
    channelNumber: channel.value.channelNumber,
    homePosition: channel.value.homePos,
  });
};
</script>

<template>
  <div class="space-y-2">
    <div class="flex items-center gap-4 flex-wrap">
      <div class="font-medium min-w-20">Channel {{ channel.channelNumber }}</div>
      <select
        :data-testid="`${parentTestId}-maestro-ch-${channel.channelNumber}-type`"
        v-model="type"
        class="select select-bordered select-sm w-30"
      >
        <option value="0">{{ $t('uart.disabled') }}</option>
        <option value="1">{{ $t('uart.servo') }}</option>
        <option value="2">{{ $t('uart.output') }}</option>
      </select>
      <div class="grow"></div>
      <button
        @click="testServoModal"
        class="btn btn-sm btn-outline"
      >
        {{ $t('uart.test') }}
      </button>
    </div>
    <div v-if="channel">
      <AstrosServoSettings
        :test-id="`${parentTestId}-maestro-ch-${channel.channelNumber}`"
        :enabled="channel.enabled"
        v-model:name="channel.channelName"
        :is-servo="channel.isServo"
        v-model:invert="channel.inverted"
        v-model:min-pulse="channel.minPos"
        v-model:max-pulse="channel.maxPos"
        v-model:home-position="channel.homePos"
      />
    </div>
  </div>
</template>
