<script setup lang="ts">
import { ControllerStatus } from '@/enums/controllerStatus';
import { computed } from 'vue';

const props = defineProps<{
  bodyStatus: ControllerStatus;
  domeStatus: ControllerStatus;
  coreStatus: ControllerStatus;
}>();

const bodyImg = computed(() => {
  if (props.bodyStatus === ControllerStatus.DOWN) {
    return new URL('@/assets/images/status/body.png', import.meta.url).href;
  } else if (props.bodyStatus === ControllerStatus.NEEDS_SYNCED) {
    return new URL('@/assets/images/status/body_yellow.png', import.meta.url).href;
  } else {
    return '';
  }
});

const domeImg = computed(() => {
  if (props.domeStatus === ControllerStatus.DOWN) {
    return new URL('@/assets/images/status/dome.png', import.meta.url).href;
  } else if (props.domeStatus === ControllerStatus.NEEDS_SYNCED) {
    return new URL('@/assets/images/status/dome_yellow.png', import.meta.url).href;
  } else {
    return '';
  }
});

const coreImg = computed(() => {
  if (props.coreStatus === ControllerStatus.DOWN) {
    return new URL('@/assets/images/status/core.png', import.meta.url).href;
  } else if (props.coreStatus === ControllerStatus.NEEDS_SYNCED) {
    return new URL('@/assets/images/status/core_yellow.png', import.meta.url).href;
  } else {
    return '';
  }
});
</script>

<template>
  <div class="flex justify-center">
    <img src="@/assets/images/status/r2.png" class="max-w-72" alt="Astro base" />
    <img
      v-show="bodyStatus !== ControllerStatus.UP"
      :src="bodyImg"
      class="absolute z-10 max-w-72 animate-pulse"
      :alt="`Body status ${bodyStatus}`"
    />
    <img
      v-show="domeStatus !== ControllerStatus.UP"
      :src="domeImg"
      class="absolute z-10 max-w-72 animate-pulse"
      :alt="`Dome status ${domeStatus}`"
    />
    <img
      v-show="coreStatus !== ControllerStatus.UP"
      :src="coreImg"
      class="absolute z-10 max-w-72 animate-pulse"
      :alt="`Core status ${coreStatus}`"
    />
  </div>
</template>
