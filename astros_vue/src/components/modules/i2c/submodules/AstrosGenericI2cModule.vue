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
  <div class="flex flex-row">
    <select v-if="module" :data-testid="`${parentTestId}-i2c-${module.moduleSubType}-address`" v-model="i2cAddress"
      @change="onI2cAddressChange(i2cAddress)" class="select select-bordered select-sm w-35">
      <option v-for="addr in addresses" :key="addr" :value="addr">Address {{ addr }}</option>
    </select>
  </div>
</template>
