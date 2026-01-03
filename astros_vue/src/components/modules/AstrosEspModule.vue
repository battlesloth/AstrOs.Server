<script setup lang="ts">
import { ref, computed, type PropType } from 'vue';
import { Location } from '@/enums/modules/Location';
import { ModuleType } from '@/enums/modules/ModuleType';
import type {
  AddModuleEvent,
  RemoveModuleEvent,
  ServoTestEvent,
  AddressChangeEvent,
} from '@/models/events';
import { useLocationStore } from '@/stores/location';
import AstrosUartModule from './uart/AstrosUartModule.vue';
import AstrosI2cModule from './i2c/AstrosI2cModule.vue';
import AstrosGpioChannel from './gpio/AstrosGpioChannel.vue';

const props = defineProps({
  isMaster: {
    type: Boolean,
    default: false,
  },
  locationEnum: {
    type: String as PropType<Location>,
    required: true,
  },
  parentTestId: {
    type: String,
    required: true,
  },
});

const locationStore = useLocationStore();
const location = computed(() => locationStore.getLocation(props.locationEnum));

const emit = defineEmits<{
  removeModule: [event: RemoveModuleEvent];
  addModule: [event: AddModuleEvent];
  openServoTestModal: [event: ServoTestEvent];
}>();

const openPanel = ref<string | null>(null);
const openUartModuleId = ref<string | undefined>(undefined);
const openI2cModuleId = ref<string | undefined>(undefined);

const addUartModule = () => {
  if (openPanel.value !== 'uart') {
    openPanel.value = 'uart';
  }

  emit('addModule', {
    locationId: props.locationEnum,
    moduleType: ModuleType.UART,
  });
};

const addI2cModule = () => {
  if (openPanel.value !== 'i2c') {
    openPanel.value = 'i2c';
  }

  emit('addModule', {
    locationId: props.locationEnum,
    moduleType: ModuleType.I2C,
  });
};

const removeModule = (evt: RemoveModuleEvent) => {
  emit('removeModule', {
    locationId: props.locationEnum,
    id: evt.id,
    moduleType: evt.moduleType,
  });
};

const toggleUartModule = (moduleId: string) => {
  openUartModuleId.value = openUartModuleId.value === moduleId ? undefined : moduleId;
};

const toggleI2cModule = (moduleId: string) => {
  openI2cModuleId.value = openI2cModuleId.value === moduleId ? undefined : moduleId;
};

const i2cAddressChanged = (evt: AddressChangeEvent) => {
  if (!location.value) return;

  // Find the module that currently has the OLD address (the one being changed)
  const moduleToUpdate = location.value.i2cModules.find((m) => m.i2cAddress === evt.old);

  // Find any module that already has the NEW address (to swap with)
  const existingModuleWithNewAddress = location.value.i2cModules.find(
    (m) => m.i2cAddress === evt.new,
  );

  if (moduleToUpdate) {
    if (existingModuleWithNewAddress) {
      existingModuleWithNewAddress.i2cAddress = evt.old;
    }
    moduleToUpdate.i2cAddress = evt.new;
  }
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
    <div
      class="collapse collapse-arrow bg-base-200 border border-base-300"
      :class="{ 'collapse-open': openPanel === 'uart', 'collapse-close': openPanel !== 'uart' }"
    >
      <div
        :data-testid="`${parentTestId}-serial-header`"
        class="collapse-title flex items-center justify-between pr-12 cursor-pointer"
        @click="openPanel = openPanel === 'uart' ? null : 'uart'"
      >
        <h3 class="font-medium">{{ $t('esp.serial_modules') }}</h3>
        <button
          type="button"
          :data-testid="`${parentTestId}-add-serial`"
          @click.stop="addUartModule"
          class="btn btn-sm btn-circle btn-ghost"
        >
          <span class="text-lg">+</span>
        </button>
      </div>
      <div class="collapse-content">
        <ul
          v-if="location?.uartModules"
          class="space-y-2 max-h-96 overflow-y-scroll p-0"
        >
          <li
            v-for="(module, index) in location.uartModules"
            :key="module.id"
          >
            <AstrosUartModule
              v-model:module="location.uartModules[index]!"
              @remove-module="removeModule"
              @servo-test="onServoTestEvent"
              @toggle-module="toggleUartModule"
              :location-id="props.locationEnum"
              :is-master="isMaster"
              :parent-test-id="parentTestId"
              :open-module-id="openUartModuleId"
            />
          </li>
        </ul>
      </div>
    </div>

    <!-- I2C Configuration Panel -->
    <div
      class="collapse collapse-arrow bg-base-200 border border-base-300"
      :class="{ 'collapse-open': openPanel === 'i2c', 'collapse-close': openPanel !== 'i2c' }"
    >
      <div
        :data-testid="`${parentTestId}-i2c-header`"
        class="collapse-title flex items-center justify-between pr-12 cursor-pointer"
        @click="openPanel = openPanel === 'i2c' ? null : 'i2c'"
      >
        <h3 class="font-medium">{{ $t('esp.i2c_modules') }}</h3>
        <button
          type="button"
          :data-testid="`${parentTestId}-add-i2c`"
          @click.stop="addI2cModule"
          class="btn btn-sm btn-circle btn-ghost"
        >
          <span class="text-lg">+</span>
        </button>
      </div>
      <div class="collapse-content">
        <ul
          v-if="location?.i2cModules"
          class="space-y-2 max-h-96 overflow-y-scroll p-0"
        >
          <li
            v-for="module in location.i2cModules"
            :key="module.id"
          >
            <AstrosI2cModule
              @remove-module="removeModule"
              @i2c-address-changed="i2cAddressChanged"
              @toggle-module="toggleI2cModule"
              :module="module"
              :location-id="props.locationEnum"
              :parent-test-id="parentTestId"
              :open-module-id="openI2cModuleId"
            />
          </li>
        </ul>
      </div>
    </div>

    <!-- GPIO Configuration Panel -->
    <div
      class="collapse collapse-arrow bg-base-200 border border-base-300"
      :class="{ 'collapse-open': openPanel === 'gpio', 'collapse-close': openPanel !== 'gpio' }"
    >
      <div
        :data-testid="`${parentTestId}-gpio-header`"
        class="collapse-title cursor-pointer"
        @click="openPanel = openPanel === 'gpio' ? null : 'gpio'"
      >
        <h3 class="font-medium">{{ $t('esp.gpio_config') }}</h3>
      </div>
      <div class="collapse-content">
        <ul
          v-if="location?.gpioModule"
          class="space-y-2 max-h-96 overflow-y-scroll p-0"
        >
          <li
            v-for="channel in location.gpioModule.channels"
            :key="channel.id"
          >
            <AstrosGpioChannel
              :channel="channel"
              :parent-test-id="parentTestId"
            />
          </li>
        </ul>
      </div>
    </div>
  </div>
</template>
