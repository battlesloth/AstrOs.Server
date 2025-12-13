<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { ModuleType, ModuleSubType } from '@/models/enums';

interface ModuleSubTypeSelection {
  id: ModuleSubType;
  value: string;
}

interface Props {
  locationId: string;
  moduleType: ModuleType;
  isOpen: boolean;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  add: [response: { locationId: string; moduleType: ModuleType; moduleSubType: ModuleSubType }];
  close: [];
}>();

const selectedSubType = ref<ModuleSubType>(ModuleSubType.none);

const moduleTypes = new Map<ModuleType, string>([
  [ModuleType.uart, 'Serial'],
  [ModuleType.i2c, 'I2C'],
  [ModuleType.gpio, 'GPIO'],
]);

const moduleSubTypes = new Map<ModuleType, ModuleSubTypeSelection[]>([
  [
    ModuleType.uart,
    [
      { id: ModuleSubType.genericSerial, value: 'Generic' },
      {
        id: ModuleSubType.humanCyborgRelationsSerial,
        value: 'Human Cyborg Relations',
      },
      { id: ModuleSubType.kangaroo, value: 'Kangaroo' },
      { id: ModuleSubType.maestro, value: 'Maestro' },
    ],
  ],
  [
    ModuleType.i2c,
    [
      { id: ModuleSubType.genericI2C, value: 'Generic' },
      {
        id: ModuleSubType.humanCyborgRelationsI2C,
        value: 'Human Cyborg Relations',
      },
      { id: ModuleSubType.pwmBoard, value: 'PWM Board' },
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
      <h2 class="text-2xl font-bold mb-4">Add Module</h2>

      <div class="modal-body py-4">
        <label class="form-control w-full">
          <div class="label">
            <span class="label-text">Select Module Type</span>
          </div>
          <select
            data-testid="modal-module-select"
            v-model="selectedSubType"
            class="select select-bordered w-full"
            title="Module"
          >
            <option :value="ModuleSubType.none" disabled selected>Select Module Type</option>
            <option v-for="option in options" :key="option.id" :value="option.id">
              {{ option.value }}
            </option>
          </select>
        </label>
      </div>

      <div class="modal-action">
        <button
          data-testid="modal-add-module"
          class="btn btn-primary"
          :disabled="selectedSubType === ModuleSubType.none"
          @click="addModule"
        >
          Add
        </button>
        <button data-testid="modal-close" class="btn" @click="closeModal">Close</button>
      </div>
    </div>
    <form method="dialog" class="modal-backdrop" @click="closeModal">
      <button>close</button>
    </form>
  </dialog>
</template>
