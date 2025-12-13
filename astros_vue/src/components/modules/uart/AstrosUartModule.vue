<script setup lang="ts">
import { computed, ref, type PropType, type Component } from 'vue';
import { ModuleType, ModuleSubType } from '@/models/enums';
import type { UartModule } from '@/models/controllers/modules/uart/uartModule';
import type { RemoveModuleEvent, ServoTestEvent } from '@/models/events';
import AstrosGenericSerialModule from './submodules/AstrosGenericSerialModule.vue';
import AstrosKangarooModule from './submodules/AstrosKangarooModule.vue';
import AstrosHcrSerialModule from './submodules/AstrosHcrSerialModule.vue';
import AstrosMaestroModule from './submodules/AstrosMaestroModule.vue';

// Props
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
  openModuleId: {
    type: String,
    default: null,
  },
});

// Emits
const emit = defineEmits<{
  removeModule: [event: RemoveModuleEvent];
  servoTest: [event: ServoTestEvent];
  toggleModule: [moduleId: string];
}>();

// Computed
const isOpen = computed(() => props.openModuleId === props.module.id);

// Computed properties
const subtypeName = computed(() => {
  switch (props.module.moduleSubType) {
    case ModuleSubType.genericSerial:
      return 'Generic Serial';
    case ModuleSubType.kangaroo:
      return 'Kangaroo X2';
    case ModuleSubType.humanCyborgRelationsSerial:
      return 'HCR';
    case ModuleSubType.maestro:
      return 'Pololu Maestro';
    default:
      return '';
  }
});

const subModuleComponent = computed<Component | null>(() => {
  switch (props.module.moduleSubType) {
    case ModuleSubType.genericSerial:
      return AstrosGenericSerialModule;
    case ModuleSubType.kangaroo:
      return AstrosKangarooModule;
    case ModuleSubType.humanCyborgRelationsSerial:
      return AstrosHcrSerialModule;
    case ModuleSubType.maestro:
      return AstrosMaestroModule;
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
    module: ModuleType.uart,
  });
};

const onServoTestEvent = (evt: ServoTestEvent) => {
  emit('servoTest', evt);
};

const toggleCollapse = () => {
  emit('toggleModule', props.module.id);
};
</script>

<template>
  <div
    class="collapse collapse-arrow bg-base-100 border border-base-300"
    :class="{ 'collapse-open': isOpen, 'collapse-close': !isOpen }"
  >
    <div
      :data-testid="`${parentTestId}-serial-${module.moduleSubType}-header`"
      class="collapse-title flex items-center justify-between pr-12 cursor-pointer"
      @click="toggleCollapse"
    >
      <div class="shrink-0 min-w-0">
        <input
          :data-testid="`${parentTestId}-serial-${module.moduleSubType}-name`"
          v-model="module.name"
          @click.stop
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
      <div
        v-if="!subModuleComponent"
        class="p-4 bg-base-200 rounded border border-dashed border-base-300"
      >
        <p class="text-sm text-base-content/60 italic">Unsupported UART Module Subtype.</p>
      </div>
      <component
        v-else
        :is="subModuleComponent"
        :module="module"
        :parent-test-id="parentTestId"
        :is-master="isMaster"
        @servo-test-event="onServoTestEvent"
      />
    </div>
  </div>
</template>
