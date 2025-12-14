<script setup lang="ts">
import { computed, type PropType } from 'vue';
import AstrosServoSettings from '../../shared/AstrosServoSettings.vue';
import { ModuleSubType } from "@/enums/modules/ModuleSubType";
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

// Props
const props = defineProps({
  channel: {
    type: Object as PropType<MaestroChannel>,
    required: true,
  },
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
    if (!props.channel.enabled) return '0';
    return props.channel.isServo ? '1' : '2';
  },
  set: (val: string) => {
    switch (val) {
      case '0':
        props.channel.enabled = false;
        break;
      case '1':
        props.channel.enabled = true;
        props.channel.isServo = true;
        break;
      case '2':
        props.channel.enabled = true;
        props.channel.isServo = false;
        break;
    }
  },
});

// Methods
const testServoModal = () => {
  emit('servoTest', {
    controllerAddress: '',
    controllerName: '',
    moduleSubType: ModuleSubType.maestro,
    channelNumber: props.channel.channelNumber,
  });
};
</script>

<template>
  <div class="space-y-2">
    <div class="flex items-center gap-4 flex-wrap">
      <div class="font-medium min-w-20">Channel {{ channel.channelNumber }}</div>
      <select :data-testid="`${parentTestId}-maestro-ch-${channel.channelNumber}-type`" v-model="type"
        class="select select-bordered select-sm w-30">
        <option value="0">Disabled</option>
        <option value="1">Servo</option>
        <option value="2">Output</option>
      </select>
      <div class="grow"></div>
      <button @click="testServoModal" class="btn btn-sm btn-outline">Test</button>
    </div>
    <div v-if="channel">
      <AstrosServoSettings :test-id="`${parentTestId}-maestro-ch-${channel.channelNumber}`" :enabled="channel.enabled"
        v-model:name="channel.channelName" :is-servo="channel.isServo" v-model:invert="channel.inverted"
        v-model:min-pulse="channel.minPos" v-model:max-pulse="channel.maxPos" v-model:home-position="channel.homePos" />
    </div>
  </div>
</template>
