<script setup lang="ts">
import { ControllerStatus } from '@/enums';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

const props = defineProps<{
  bodyStatus: ControllerStatus;
  domeStatus: ControllerStatus;
  coreStatus: ControllerStatus;
}>();

const { t } = useI18n();

// Vite resolves `new URL(static-string, import.meta.url)` at build time, so
// each asset path must be a literal string (template literals would silently
// fail to resolve). Pre-resolved here, then selected by status.
const bodyRed = new URL('@/assets/images/status/body_red.png', import.meta.url).href;
const bodyYellow = new URL('@/assets/images/status/body_yellow.png', import.meta.url).href;
const bodyGrey = new URL('@/assets/images/status/body_grey.png', import.meta.url).href;
const domeRed = new URL('@/assets/images/status/dome_red.png', import.meta.url).href;
const domeYellow = new URL('@/assets/images/status/dome_yellow.png', import.meta.url).href;
const domeGrey = new URL('@/assets/images/status/dome_grey.png', import.meta.url).href;
const coreRed = new URL('@/assets/images/status/core_red.png', import.meta.url).href;
const coreYellow = new URL('@/assets/images/status/core_yellow.png', import.meta.url).href;
const coreGrey = new URL('@/assets/images/status/core_grey.png', import.meta.url).href;

function imgFor(status: ControllerStatus, red: string, yellow: string, grey: string): string {
  switch (status) {
    case ControllerStatus.NEEDS_SYNCED:
      return yellow;
    case ControllerStatus.FIRMWARE_INCOMPATIBLE:
      return red;
    case ControllerStatus.DOWN:
      return grey;
    default:
      return '';
  }
}

const bodyImg = computed(() => imgFor(props.bodyStatus, bodyRed, bodyYellow, bodyGrey));
const domeImg = computed(() => imgFor(props.domeStatus, domeRed, domeYellow, domeGrey));
const coreImg = computed(() => imgFor(props.coreStatus, coreRed, coreYellow, coreGrey));

function altFor(status: ControllerStatus, locationKey: string): string {
  return t(`statusPage.alt.${status}`, { location: t(locationKey) });
}
</script>

<template>
  <div class="flex justify-center">
    <img
      src="@/assets/images/status/r2.png"
      class="max-w-72"
      :alt="$t('statusPage.base_alt')"
    />
    <img
      v-show="bodyStatus !== ControllerStatus.UP"
      :src="bodyImg"
      class="absolute z-10 max-w-72"
      :class="{ 'animate-pulse': bodyStatus !== ControllerStatus.DOWN }"
      :alt="altFor(bodyStatus, 'module_view.body')"
    />
    <img
      v-show="domeStatus !== ControllerStatus.UP"
      :src="domeImg"
      class="absolute z-10 max-w-72"
      :class="{ 'animate-pulse': domeStatus !== ControllerStatus.DOWN }"
      :alt="altFor(domeStatus, 'module_view.dome')"
    />
    <img
      v-show="coreStatus !== ControllerStatus.UP"
      :src="coreImg"
      class="absolute z-10 max-w-72"
      :class="{ 'animate-pulse': coreStatus !== ControllerStatus.DOWN }"
      :alt="altFor(coreStatus, 'module_view.core')"
    />
  </div>
</template>
