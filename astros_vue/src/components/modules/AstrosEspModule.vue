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
import AstrosUartModule from './uart/AstrosUartModule.vue';
import AstrosI2cModule from './i2c/AstrosI2cModule.vue';
import AstrosGpioChannel from './gpio/AstrosGpioChannel.vue';

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
const openPanel = ref<string | null>(null);
const openUartModuleId = ref<string | undefined>(undefined);
const i2cUpdateTrigger = ref(0);

// Methods
const addUartModule = (evt: Event) => {
    evt.stopPropagation();

    if (openPanel.value !== 'uart') {
        openPanel.value = 'uart';
    }

    emit('addModule', {
        locationId: location.value?.id ?? '',
        module: ModuleType.uart,
    });
};

const addI2cModule = (evt: Event) => {
    evt.stopPropagation();

    if (openPanel.value !== 'i2c') {
        openPanel.value = 'i2c';
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

const toggleUartModule = (moduleId: string) => {
    openUartModuleId.value = openUartModuleId.value === moduleId ? undefined : moduleId;
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
            :class="{ 'collapse-open': openPanel === 'uart', 'collapse-close': openPanel !== 'uart' }">
            <input type="radio" :name="`${parentTestId}-panel`"
                @change="openPanel = openPanel === 'uart' ? null : 'uart'" :checked="openPanel === 'uart'" />
            <div :data-testid="`${parentTestId}-serial-header`"
                class="collapse-title flex items-center justify-between pr-12 cursor-pointer"
                @click="openPanel = openPanel === 'uart' ? null : 'uart'">
                <h3 class="font-medium">Serial Modules</h3>
                <button :data-testid="`${parentTestId}-add-serial`" @click.stop="addUartModule"
                    class="btn btn-sm btn-circle btn-ghost">
                    <span class="text-lg">+</span>
                </button>
            </div>
            <div class="collapse-content">
                <ul v-if="location?.uartModules" class="space-y-2 max-h-96 overflow-y-auto p-0">
                    <li v-for="module in location.uartModules" :key="module.id">
                        <AstrosUartModule @remove-module="removeModule" @servo-test="onServoTestEvent"
                            @toggle-module="toggleUartModule" :module="module" :is-master="isMaster"
                            :parent-test-id="parentTestId" :open-module-id="openUartModuleId" />
                    </li>
                </ul>
            </div>
        </div>

        <!-- I2C Configuration Panel -->
        <div class="collapse collapse-arrow bg-base-200 border border-base-300"
            :class="{ 'collapse-open': openPanel === 'i2c', 'collapse-close': openPanel !== 'i2c' }">
            <input type="radio" :name="`${parentTestId}-panel`" @change="openPanel = openPanel === 'i2c' ? null : 'i2c'"
                :checked="openPanel === 'i2c'" />
            <div :data-testid="`${parentTestId}-i2c-header`"
                class="collapse-title flex items-center justify-between pr-12 cursor-pointer"
                @click="openPanel = openPanel === 'i2c' ? null : 'i2c'">
                <h3 class="font-medium">I2C configuration</h3>
                <button :data-testid="`${parentTestId}-add-i2c`" @click.stop="addI2cModule"
                    class="btn btn-sm btn-circle btn-ghost">
                    <span class="text-lg">+</span>
                </button>
            </div>
            <div class="collapse-content">
                <ul v-if="location?.i2cModules" class="space-y-2 max-h-96 overflow-y-auto p-0">
                    <li v-for="module in location.i2cModules" :key="module.id">
                        <AstrosI2cModule @remove-module="removeModule" @i2c-address-changed="i2cAddressChanged"
                            :update-trigger="i2cUpdateTrigger" :module="module" :parent-test-id="parentTestId" />
                    </li>
                </ul>
            </div>
        </div>

        <!-- GPIO Configuration Panel -->
        <div class="collapse collapse-arrow bg-base-200 border border-base-300"
            :class="{ 'collapse-open': openPanel === 'gpio', 'collapse-close': openPanel !== 'gpio' }">
            <input type="radio" :name="`${parentTestId}-panel`"
                @change="openPanel = openPanel === 'gpio' ? null : 'gpio'" :checked="openPanel === 'gpio'" />
            <div :data-testid="`${parentTestId}-gpio-header`" class="collapse-title cursor-pointer"
                @click="openPanel = openPanel === 'gpio' ? null : 'gpio'">
                <h3 class="font-medium">GPIO configuration</h3>
            </div>
            <div class="collapse-content">
                <ul v-if="location?.gpioModule" class="space-y-2 max-h-96 overflow-y-auto p-0">
                    <li v-for="channel in location.gpioModule.channels" :key="channel.id">
                        <AstrosGpioChannel :channel="channel" :parent-test-id="parentTestId" />
                    </li>
                </ul>
            </div>
        </div>
    </div>
</template>
