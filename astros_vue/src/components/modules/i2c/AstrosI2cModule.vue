<script setup lang="ts">
import { ref, computed, type PropType, type Component } from 'vue';
import { ModuleType } from '@/enums/modules/ModuleType';
import { ModuleSubType } from '@/enums/modules/ModuleSubType';
import type { I2cModule } from '@/models/controllers/modules/i2c/i2cModule';
import type { RemoveModuleEvent, AddressChangeEvent } from '@/models/events';
import { Location } from '@/enums/modules/Location';
import AstrosGenericI2cModule from './submodules/AstrosGenericI2cModule.vue';
import AstrosPca9685Module from './submodules/AstrosPca9685Module.vue';

const props = defineProps({
  module: {
    type: Object as PropType<I2cModule>,
    required: true,
  },
  locationId: {
    type: String as PropType<Location>,
    required: true,
  },
  parentTestId: {
    type: String,
    required: true,
  },
  openModuleId: {
    type: String,
    default: null,
  },
});

const emit = defineEmits<{
  removeModule: [event: RemoveModuleEvent];
  i2cAddressChanged: [event: AddressChangeEvent];
  toggleModule: [moduleId: string];
}>();

const isOpen = computed(() => props.openModuleId === props.module.id);

const subtypeName = computed(() => {
  switch (props.module.moduleSubType) {
    case ModuleSubType.GENERIC_I2C:
      return 'i2c.generic';
    case ModuleSubType.HUMAN_CYBORG_RELATIONS_I2C:
      return 'i2c.hcr';
    case ModuleSubType.PWM_BOARD:
      return 'i2c.pwm_board';
    default:
      return '';
  }
});

const subModuleComponent = computed<Component | null>(() => {
  switch (props.module.moduleSubType) {
    case ModuleSubType.GENERIC_I2C:
      return AstrosGenericI2cModule;
    case ModuleSubType.HUMAN_CYBORG_RELATIONS_I2C:
    case ModuleSubType.PWM_BOARD:
      return AstrosPca9685Module;
    default:
      return null;
  }
});

const nameClicked = (evt: MouseEvent) => {
  evt.stopPropagation();
};

const removeModule = (event: Event) => {
  event.stopPropagation();
  emit('removeModule', {
    locationId: props.locationId,
    id: props.module.id,
    moduleType: ModuleType.I2C,
  });
};

const toggleCollapse = () => {
  emit('toggleModule', props.module.id);
};

const onI2cAddressChanged = (value: string) => {
  emit('i2cAddressChanged', {
    old: props.module.i2cAddress,
    new: parseInt(value, 10),
  });
};
</script>

<template>
  <div
    class="collapse collapse-arrow bg-base-100 border border-base-300"
    :class="{ 'collapse-open': isOpen, 'collapse-close': !isOpen }"
  >
    <div
      :data-testid="`${parentTestId}-i2c-${module.moduleSubType}-header`"
      class="collapse-title flex items-center justify-between pr-12 cursor-pointer"
      @click="toggleCollapse"
    >
      <div class="shrink-0 min-w-0">
        <input
          :data-testid="`${parentTestId}-i2c-${module.moduleSubType}-name`"
          v-model="module.name"
          @click.stop
          @keydown.space.stop
          placeholder="Name"
          class="input input-bordered input-sm w-full max-w-xs"
        />
      </div>
      <div class="flex items-center gap-2 ml-4">
        <p class="text-sm text-base-content/60">{{ $t(subtypeName) }}</p>
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
