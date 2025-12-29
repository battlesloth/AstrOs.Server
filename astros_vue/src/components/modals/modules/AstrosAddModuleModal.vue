<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { Location } from '@/enums/modules/Location';
import { ModuleType } from "@/enums/modules/ModuleType";
import { ModuleSubType } from "@/enums/modules/ModuleSubType";
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

const selectedSubType = ref<ModuleSubType>(ModuleSubType.none);

const moduleSubTypes = new Map<ModuleType, ModuleSubTypeSelection[]>([
  [
    ModuleType.uart,
    [
      { id: ModuleSubType.genericSerial, value: "modals.add_module.module_types.generic" },
      {
        id: ModuleSubType.humanCyborgRelationsSerial,
        value: "modals.add_module.module_types.hcr",
      },
      { id: ModuleSubType.kangaroo, value: "modals.add_module.module_types.kangaroo" },
      { id: ModuleSubType.maestro, value: "modals.add_module.module_types.maestro" },
    ],
  ],
  [
    ModuleType.i2c,
    [
      { id: ModuleSubType.genericI2C, value: "modals.add_module.module_types.generic" },
      {
        id: ModuleSubType.humanCyborgRelationsI2C,
        value: "modals.add_module.module_types.hcr",
      },
      { id: ModuleSubType.pwmBoard, value: "modals.add_module.module_types.pwm_board" },
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
    selectedSubType.value = ModuleSubType.none;
  },
);

const addModule = () => {
  if (selectedSubType.value === ModuleSubType.none) {
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
  <dialog class="modal" :class="{ 'modal-open': isOpen }">
    <div class="modal-box">
      <h2 class="text-2xl font-bold mb-4">{{ $t('modals.add_module.title') }}</h2>

      <div class="modal-body py-4">
        <label class="form-control w-full">
          <div class="label">
            <span class="label-text">{{ $t('modals.add_module.select_type') }}</span>
          </div>
          <select data-testid="modal-module-select" v-model="selectedSubType" class="select select-bordered w-full"
            title="Module">
            <option :value="ModuleSubType.none" disabled selected>{{ $t('modals.add_module.select_type') }}</option>
            <option v-for="option in options" :key="option.id" :value="option.id">
              {{ $t(option.value) }}
            </option>
          </select>
        </label>
      </div>

      <div class="modal-action">
        <button data-testid="modal-add-module" class="btn btn-primary"
          :disabled="selectedSubType === ModuleSubType.none" @click="addModule">
          {{ $t('modals.add_module.add_button') }}
        </button>
        <button data-testid="modal-close" class="btn" @click="closeModal">{{ $t('modals.add_module.cancel_button')
        }}</button>
      </div>
    </div>
    <form method="dialog" class="modal-backdrop" @click="closeModal">
      <button>{{ $t('modals.add_module.cancel_button') }}</button>
    </form>
  </dialog>
</template>
