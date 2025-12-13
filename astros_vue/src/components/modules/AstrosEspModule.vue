<script setup lang="ts">
import { ref, computed, type PropType } from 'vue';
import { ModuleType, Location } from '@/models/enums';
import type {
    AddModuleEvent,
    RemoveModuleEvent,
    ServoTestEvent,
    AddressChangeEvent
} from '@/models/events';
import { useLocationStore } from '@/stores/location';

// Props
const props = defineProps({
    isMaster: {
        type: Boolean,
        default: false
    },
    locationEnum: {
        type: String as PropType<Location>,
        required: true
    },
    parentTestId: {
        type: String,
        required: true
    }
});

// Store
const locationStore = useLocationStore();
const location = computed(() => locationStore.getLocation(props.locationEnum));

// Emits
const emit = defineEmits<{
    removeModule: [event: RemoveModuleEvent];
    addModule: [event: AddModuleEvent];
    openServoTestModal: [event: ServoTestEvent];
}>();

// Reactive state
const uartPanelOpenState = ref(false);
const i2cPanelOpenState = ref(false);
const gpioPanelOpenState = ref(false);
const i2cUpdateTrigger = ref(0);

// Methods
const addUartModule = (evt: Event) => {
    evt.stopPropagation();

    if (!uartPanelOpenState.value) {
        uartPanelOpenState.value = true;
    }

    emit('addModule', {
        locationId: location.value?.id ?? '',
        module: ModuleType.uart,
    });
};

const addI2cModule = (evt: Event) => {
    evt.stopPropagation();

    if (!i2cPanelOpenState.value) {
        i2cPanelOpenState.value = true;
    }

    emit('addModule', {
        locationId: location.value?.id ?? '',
        module: ModuleType.i2c,
    });
};

const removeModule = (evt: RemoveModuleEvent) => {
    emit('removeModule', {
        locationId: location.value?.id ?? '',
        id: evt.id,
        module: evt.module,
    });
};

const i2cAddressChanged = (evt: AddressChangeEvent) => {
    if (!location.value) return;

    // if the new address is in use, swap it to the old address
    const m1 = location.value.i2cModules.find((m) => m.i2cAddress === evt.new);

    if (m1) {
        m1.i2cAddress = evt.old;
    }

    const m2 = location.value.i2cModules.find((m) => m.i2cAddress === evt.old);

    if (m2) {
        m2.i2cAddress = evt.new;
    }

    i2cUpdateTrigger.value++;
};

const onServoTestEvent = (evt: ServoTestEvent) => {
    if (!location.value?.controller) return;

    evt.controllerAddress = location.value.controller.address;
    evt.controllerName = location.value.controller.name;
    emit('openServoTestModal', evt);
};
</script>

<template>
    <div class="w-full space-y-2">
        <!-- Serial Modules Panel -->
        <div class="collapse collapse-arrow bg-base-200 border border-base-300"
            :class="{ 'collapse-open': uartPanelOpenState, 'collapse-close': !uartPanelOpenState }">
            <input type="checkbox" v-model="uartPanelOpenState" class="hidden" />
            <div :data-testid="`${parentTestId}-serial-header`"
                class="collapse-title flex items-center justify-between pr-12 cursor-pointer"
                @click="uartPanelOpenState = !uartPanelOpenState">
                <h3 class="font-medium">Serial Modules</h3>
                <button :data-testid="`${parentTestId}-add-serial`" @click.stop="addUartModule"
                    class="btn btn-sm btn-circle btn-ghost">
                    <span class="text-lg">+</span>
                </button>
            </div>
            <div class="collapse-content">
                <ul v-if="location?.uartModules" class="space-y-2 max-h-96 overflow-y-auto p-0">
                    <li v-for="module in location.uartModules" :key="module.id">
                        <!-- Replace with UartModule component when available -->
                        <div
                            class="p-4 bg-base-100 border border-dashed border-base-300 rounded italic text-base-content/60">
                            UART Module: {{ module.id }}
                            <!-- <UartModule 
                @remove-module-event="removeModule" 
                @servo-test-event="onServoTestEvent"
                :module="module" 
                :is-master="isMaster"
                :parent-test-id="parentTestId"
              /> -->
                        </div>
                    </li>
                </ul>
            </div>
        </div>

        <!-- I2C Configuration Panel -->
        <div class="collapse collapse-arrow bg-base-200 border border-base-300"
            :class="{ 'collapse-open': i2cPanelOpenState, 'collapse-close': !i2cPanelOpenState }">
            <input type="checkbox" v-model="i2cPanelOpenState" class="hidden" />
            <div :data-testid="`${parentTestId}-i2c-header`"
                class="collapse-title flex items-center justify-between pr-12 cursor-pointer"
                @click="i2cPanelOpenState = !i2cPanelOpenState">
                <h3 class="font-medium">I2C configuration</h3>
                <button :data-testid="`${parentTestId}-add-i2c`" @click.stop="addI2cModule"
                    class="btn btn-sm btn-circle btn-ghost">
                    <span class="text-lg">+</span>
                </button>
            </div>
            <div class="collapse-content">
                <ul v-if="location?.i2cModules" class="space-y-2 max-h-96 overflow-y-auto p-0">
                    <li v-for="module in location.i2cModules" :key="module.id">
                        <!-- Replace with I2cModule component when available -->
                        <div class="p-4 bg-base-100 border-2 border-base-content/20 rounded">
                            I2C Module: {{ module.id }}
                            <!-- <I2cModule 
                @remove-module-event="removeModule" 
                @i2c-address-changed-event="i2cAddressChanged"
                :update-trigger="i2cUpdateTrigger"
                :module="module" 
                :parent-test-id="parentTestId"
              /> -->
                        </div>
                    </li>
                </ul>
            </div>
        </div>

        <!-- GPIO Configuration Panel -->
        <div class="collapse collapse-arrow bg-base-200 border border-base-300"
            :class="{ 'collapse-open': gpioPanelOpenState, 'collapse-close': !gpioPanelOpenState }">
            <input type="checkbox" v-model="gpioPanelOpenState" class="hidden" />
            <div :data-testid="`${parentTestId}-gpio-header`" class="collapse-title cursor-pointer"
                @click="gpioPanelOpenState = !gpioPanelOpenState">
                <h3 class="font-medium">GPIO configuration</h3>
            </div>
            <div class="collapse-content">
                <ul v-if="location?.gpioModule" class="space-y-2 max-h-96 overflow-y-auto p-0">
                    <li v-for="channel in location.gpioModule.channels" :key="channel.id">
                        <!-- Replace with GpioChannel component when available -->
                        <div class="p-4 bg-base-100 border-2 border-base-content/20 rounded">
                            GPIO Channel: {{ channel.id }}
                            <!-- <GpioChannel 
                :channel="channel"
                :parent-test-id="parentTestId"
              /> -->
                        </div>
                    </li>
                </ul>
            </div>
        </div>
    </div>
</template>

<style scoped>
/* Minimal custom styles - using Tailwind and DaisyUI utilities */
</style>
