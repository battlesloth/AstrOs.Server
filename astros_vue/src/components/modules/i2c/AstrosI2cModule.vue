<script setup lang="ts">
import { computed, type PropType, type Component } from 'vue';
import { ModuleType, ModuleSubType } from '@/models/enums';
import type { I2cModule } from '@/models/controllers/modules/i2c/i2cModule';
import type { RemoveModuleEvent, AddressChangeEvent } from '@/models/events';
import AstrosGenericI2cModule from './submodules/AstrosGenericI2cModule.vue';
import AstrosPca9685Module from './submodules/AstrosPca9685Module.vue';

// Props
const props = defineProps({
  module: {
    type: Object as PropType<I2cModule>,
    required: true,
  },
  parentTestId: {
    type: String,
    required: true,
  },
  updateTrigger: {
    type: Number,
    default: 0,
  },
});

// Emits
const emit = defineEmits<{
  removeModule: [event: RemoveModuleEvent];
  i2cAddressChanged: [event: AddressChangeEvent];
}>();

// Computed properties
const subtypeName = computed(() => {
  switch (props.module.moduleSubType) {
    case ModuleSubType.genericI2C:
      return 'Generic I2C';
    case ModuleSubType.humanCyborgRelationsI2C:
      return 'Human Cyborg Relations';
    case ModuleSubType.pwmBoard:
      return 'PCA9685 PWM Board';
    default:
      return '';
  }
});

const subModuleComponent = computed<Component | null>(() => {
  switch (props.module.moduleSubType) {
    case ModuleSubType.genericI2C:
      return AstrosGenericI2cModule;
    case ModuleSubType.humanCyborgRelationsI2C:
    case ModuleSubType.pwmBoard:
      return AstrosPca9685Module;
    default:
      return null;
  }
});

// Methods
const nameClicked = (evt: MouseEvent) => {
  evt.stopPropagation();
};

const removeModule = (event: Event) => {
  event.stopPropagation();
  emit('removeModule', {
    locationId: props.module.locationId,
    id: props.module.id,
    module: ModuleType.i2c,
  });
};

const onI2cAddressChanged = (value: string) => {
  console.log('I2C Address Changed:', value);
  emit('i2cAddressChanged', {
    old: props.module.i2cAddress,
    new: parseInt(value, 10),
  });
};
</script>

<template>
  <div class="collapse collapse-arrow bg-base-100 border border-base-300">
    <input type="checkbox" class="peer" />
    <div
      :data-testid="`${parentTestId}-i2c-${module.moduleSubType}-header`"
      class="collapse-title flex items-center justify-between pr-12"
    >
      <div class="shrink-0 min-w-0">
        <input
          :data-testid="`${parentTestId}-i2c-${module.moduleSubType}-name`"
          v-model="module.name"
          @click="nameClicked"
          @keydown.space.stop
          placeholder="Name"
          class="input input-bordered input-sm w-full max-w-xs"
        />
      </div>
      <div class="flex items-center gap-2 ml-4">
        <p class="text-sm text-base-content/60">{{ subtypeName }}</p>
        <button
          @click.stop="removeModule"
          @keydown.enter.prevent="removeModule"
          @keydown.space.prevent="removeModule"
          class="btn btn-sm btn-circle btn-ghost"
        >
          <span class="text-lg">×</span>
        </button>
      </div>
    </div>
    <div class="collapse-content">
      <component
        v-if="subModuleComponent"
        :is="subModuleComponent"
        :module="module"
        :parent-test-id="parentTestId"
        @i2c-address-changed="onI2cAddressChanged"
      />
    </div>
  </div>
</template>
