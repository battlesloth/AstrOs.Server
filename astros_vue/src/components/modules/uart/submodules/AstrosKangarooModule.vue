<script setup lang="ts">
import { ref, watch, type PropType } from 'vue';
import type { UartModule } from '@/models/controllers/modules/uart/uartModule';

// Kangaroo submodule interface
interface KangarooX2 {
    id: string;
    ch1Name: string;
    ch2Name: string;
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

// Reactive state
const uartChannel = ref<string>('');
const baudRate = ref<string>('');
const subModule = ref<KangarooX2 | null>(null);

// Watch for module changes
watch(() => props.module, (newModule) => {
    if (newModule) {
        uartChannel.value = newModule.uartChannel.toString();
        baudRate.value = newModule.baudRate.toString();
        subModule.value = newModule.subModule as KangarooX2;
    }
}, { immediate: true });

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
            <select :data-testid="`${parentTestId}-kangaroo-uart-channel`" v-model="uartChannel"
                @change="onChannelChange(uartChannel)" class="select select-bordered select-sm w-30">
                <option v-if="!isMaster" value="1">Channel 1</option>
                <option value="2">Channel 2</option>
            </select>
            <select :data-testid="`${parentTestId}-kangaroo-baud`" v-model="baudRate"
                @change="onBaudRateChange(baudRate)" class="select select-bordered select-sm w-30">
                <option value="9600">9600</option>
                <option value="19200">19200</option>
                <option value="38400">38400</option>
                <option value="57600">57600</option>
                <option value="115200">115200</option>
            </select>
        </div>
        <div v-if="subModule" class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div class="flex items-center gap-2">
                <label class="label-text font-medium min-w-20">Channel 1</label>
                <input :data-testid="`${parentTestId}-kangaroo-ch1Name`" v-model="subModule.ch1Name"
                    placeholder="Channel 1" class="input input-bordered input-sm grow" />
            </div>
            <div class="flex items-center gap-2">
                <label class="label-text font-medium min-w-20">Channel 2</label>
                <input :data-testid="`${parentTestId}-kangaroo-ch2Name`" v-model="subModule.ch2Name"
                    placeholder="Channel 2" class="input input-bordered input-sm grow" />
            </div>
        </div>
    </div>
</template>
