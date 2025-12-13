<script setup lang="ts">
import { ref, watch, type PropType } from 'vue';
import type { UartModule } from '@/models/module.types';
import type { ServoTestEvent } from '@/models/events';
import MaestroChannel from './MaestroChannel.vue';

// MaestroChannel interface
interface MaestroChannelType {
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

// MaestroBoard interface
interface MaestroBoard {
    channelCount: number;
    channels: MaestroChannelType[];
}

// MaestroModule interface
interface MaestroModule {
    boards: MaestroBoard[];
}

// Props
const props = defineProps({
    module: {
        type: Object as PropType<UartModule>,
        required: true
    },
    parentTestId: {
        type: String,
        required: true
    },
    isMaster: {
        type: Boolean,
        default: false
    }
});

// Emits
const emit = defineEmits<{
    servoTest: [event: ServoTestEvent];
}>();

// Reactive state
const uartChannel = ref<string>('');
const baudRate = ref<string>('');
const channelCount = ref<string>('24');
const subModule = ref<MaestroModule | null>(null);

// Watch for module changes
watch(() => props.module, (newModule) => {
    if (newModule) {
        uartChannel.value = newModule.uartChannel.toString();
        baudRate.value = newModule.baudRate.toString();
        subModule.value = newModule.subModule as MaestroModule;
        if (subModule.value?.boards[0]) {
            channelCount.value = subModule.value.boards[0].channelCount.toString();
        }
    }
}, { immediate: true });

// Methods
const onChannelChange = (val: string) => {
    props.module.uartChannel = parseInt(val);
};

const onBaudRateChange = (val: string) => {
    props.module.baudRate = parseInt(val);
};

const onChannelCountChange = (val: string) => {
    const listSize = parseInt(val);
    if (subModule.value?.boards[0]) {
        for (let i = 23; i > listSize; i--) {
            subModule.value.boards[0].channels[i]!.enabled = false;
        }
        subModule.value.boards[0].channelCount = listSize;
    }
};

const onServoTestEvent = (evt: ServoTestEvent) => {
    emit('servoTest', evt);
};
</script>

<template>
    <div class="space-y-4">
        <div class="flex flex-row gap-5 flex-wrap">
            <select :data-testid="`${parentTestId}-maestro-uart-channel`" v-model="uartChannel"
                @change="onChannelChange(uartChannel)" class="select select-bordered select-sm w-[120px]">
                <option v-if="!isMaster" value="1">Channel 1</option>
                <option value="2">Channel 2</option>
            </select>
            <select :data-testid="`${parentTestId}-maestro-baud`" v-model="baudRate"
                @change="onBaudRateChange(baudRate)" class="select select-bordered select-sm w-[120px]">
                <option value="9600">9600</option>
                <option value="19200">19200</option>
                <option value="38400">38400</option>
                <option value="57600">57600</option>
                <option value="115200">115200</option>
            </select>
            <select :data-testid="`${parentTestId}-maestro-channel-count`" v-model="channelCount"
                @change="onChannelCountChange(channelCount)" class="select select-bordered select-sm w-[120px]">
                <option value="6">6 Channels</option>
                <option value="12">12 Channels</option>
                <option value="18">18 Channels</option>
                <option value="24">24 Channels</option>
            </select>
        </div>
        <div class="divider"></div>
        <ul v-if="subModule && subModule.boards[0]" class="space-y-4 max-h-96 overflow-y-auto">
            <li v-for="(channel, i) in subModule.boards[0].channels" :key="channel.id"
                v-show="i < subModule.boards[0].channelCount" class="border-2 border-base-300 rounded p-4">
                <MaestroChannel :channel="channel" :parent-test-id="parentTestId" @servo-test="onServoTestEvent" />
            </li>
        </ul>
    </div>
</template>

<style scoped>
/* Using Tailwind and DaisyUI utilities */
</style>
