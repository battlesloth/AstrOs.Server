<script setup lang="ts">
import { ref, watch, type PropType } from 'vue';
import type { I2cModule } from '@/models/controllers/modules/i2c/i2cModule';

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
});

// Emits
const emit = defineEmits<{
  i2cAddressChanged: [value: string];
}>();

// Reactive state
const i2cAddress = ref<string>('');
const addresses = Array.from(Array(128).keys()).map((val) => val.toString());

// Watch for module changes
watch(
  () => props.module.i2cAddress,
  (newAddress) => {
    if (newAddress !== undefined) {
      i2cAddress.value = newAddress.toString();
    }
  },
  { immediate: true },
);

// Methods
const onI2cAddressChange = (val: string) => {
  emit('i2cAddressChanged', val);
};
</script>

<template>
  <div>
    <div class="flex flex-row mb-4">
      <select v-if="module" v-model="i2cAddress" @change="onI2cAddressChange(i2cAddress)"
        class="select select-bordered select-sm w-35">
        <option v-for="addr in addresses" :key="addr" :value="addr">Address {{ addr }}</option>
      </select>
    </div>
    <div class="p-4 bg-warning/10 border border-warning rounded">
      <h3 class="text-lg font-semibold">Not Yet Implemented</h3>
      <p class="text-sm text-base-content/70 mt-2">
        PCA9685 PWM Board configuration interface coming soon
      </p>
    </div>
  </div>
</template>
