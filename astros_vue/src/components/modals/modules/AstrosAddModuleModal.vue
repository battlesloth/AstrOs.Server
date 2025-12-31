<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { Location } from '@/enums/modules/Location';
import { ModuleType } from '@/enums/modules/ModuleType';
import { ModuleSubType } from '@/enums/modules/ModuleSubType';
import type { AddModuleEvent } from '@/models/events';

interface ModuleSubTypeSelection {
  id: ModuleSubType;
  value: string;
}

const props = defineProps<{
  locationId: Location;
  moduleType: ModuleType;
  isOpen: boolean;
}>();

const emit = defineEmits<{
  add: [response: AddModuleEvent];
  close: [];
}>();

const selectedSubType = ref<ModuleSubType>(ModuleSubType.NONE);

const moduleSubTypes = new Map<ModuleType, ModuleSubTypeSelection[]>([
  [
    ModuleType.UART,
    [
      { id: ModuleSubType.GENERIC_SERIAL, value: 'modals.add_module.module_types.generic' },
      {
        id: ModuleSubType.HUMAN_CYBORG_RELATIONS_SERIAL,
        value: 'modals.add_module.module_types.hcr',
      },
      { id: ModuleSubType.KANGAROO, value: 'modals.add_module.module_types.kangaroo' },
      { id: ModuleSubType.MAESTRO, value: 'modals.add_module.module_types.maestro' },
    ],
  ],
  [
    ModuleType.I2C,
    [
      { id: ModuleSubType.GENERIC_I2C, value: 'modals.add_module.module_types.generic' },
      {
        id: ModuleSubType.HUMAN_CYBORG_RELATIONS_I2C,
        value: 'modals.add_module.module_types.hcr',
      },
      { id: ModuleSubType.PWM_BOARD, value: 'modals.add_module.module_types.pwm_board' },
    ],
  ],
]);

const options = computed(() => {
  return moduleSubTypes.get(props.moduleType) || [];
});

// Reset selection when modal opens or module type changes
watch(
  () => [props.isOpen, props.moduleType],
  () => {
    selectedSubType.value = ModuleSubType.NONE;
  },
);

const addModule = () => {
  if (selectedSubType.value === ModuleSubType.NONE) {
    return;
  }

  emit('add', {
    locationId: props.locationId,
    moduleType: props.moduleType,
    moduleSubType: selectedSubType.value,
  });
};

const closeModal = () => {
  emit('close');
};
</script>

<template>
  <dialog
    class="modal"
    :class="{ 'modal-open': isOpen }"
  >
    <div class="modal-box">
      <h2 class="text-2xl font-bold mb-4">{{ $t('modals.add_module.title') }}</h2>

      <div class="modal-body py-4">
        <label class="form-control w-full">
          <div class="label">
            <span class="label-text">{{ $t('modals.add_module.select_type') }}</span>
          </div>
          <select
            data-testid="modal-module-select"
            v-model="selectedSubType"
            class="select select-bordered w-full"
            title="Module"
          >
            <option
              :value="ModuleSubType.NONE"
              disabled
              selected
            >
              {{ $t('modals.add_module.select_type') }}
            </option>
            <option
              v-for="option in options"
              :key="option.id"
              :value="option.id"
            >
              {{ $t(option.value) }}
            </option>
          </select>
        </label>
      </div>

      <div class="modal-action">
        <button
          data-testid="modal-add-module"
          class="btn btn-primary"
          :disabled="selectedSubType === ModuleSubType.NONE"
          @click="addModule"
        >
          {{ $t('modals.add_module.add_button') }}
        </button>
        <button
          data-testid="modal-close"
          class="btn"
          @click="closeModal"
        >
          {{ $t('modals.add_module.cancel_button') }}
        </button>
      </div>
    </div>
    <form
      method="dialog"
      class="modal-backdrop"
      @click="closeModal"
    >
      <button>{{ $t('modals.add_module.cancel_button') }}</button>
    </form>
  </dialog>
</template>
