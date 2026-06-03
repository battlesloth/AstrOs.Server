<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { compareTags } from '@/utils/version';

const props = defineProps<{
  current: string;
  target: string | null;
}>();

const { t } = useI18n();

const upToDate = computed(() => props.target === null || props.target === props.current);

// `compareTags` returns NaN for malformed input. `NaN > 0` is false, so a
// malformed `current` would silently appear as an upgrade — explicit guard
// here keeps the styling neutral instead of misleading.
const downgrade = computed(() => {
  if (upToDate.value || props.target === null) return false;
  const cmp = compareTags(props.current, props.target);
  if (Number.isNaN(cmp)) return false;
  return cmp > 0;
});
</script>

<template>
  <span :class="['astros-firmware-version-delta', { 'is-downgrade': downgrade }]">
    <span class="astros-firmware-version-delta__current">{{ current }}</span>
    <template v-if="upToDate">
      <span class="astros-firmware-version-delta__suffix">{{
        t('firmware_view.controllers.up_to_date_suffix')
      }}</span>
    </template>
    <template v-else>
      <span
        class="astros-firmware-version-delta__arrow"
        aria-hidden="true"
        >→</span
      >
      <span class="astros-firmware-version-delta__target">{{ target }}</span>
      <span
        v-if="downgrade"
        class="astros-firmware-version-delta__pill"
        >{{ t('firmware_view.controllers.downgrade_pill') }}</span
      >
    </template>
  </span>
</template>

<style scoped>
.astros-firmware-version-delta {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-family: ui-monospace, 'SF Mono', monospace;
  font-size: 11px;
  color: #4b5b73;
}

.astros-firmware-version-delta__current,
.astros-firmware-version-delta__target {
  font-weight: 500;
}

.astros-firmware-version-delta__arrow {
  font-family: 'Inter', system-ui, sans-serif;
}

.astros-firmware-version-delta.is-downgrade .astros-firmware-version-delta__arrow,
.astros-firmware-version-delta.is-downgrade .astros-firmware-version-delta__target {
  color: #9a2828;
}

.astros-firmware-version-delta__suffix {
  font-family: 'Inter', system-ui, sans-serif;
  font-size: 11px;
  color: #4b5b73;
}

.astros-firmware-version-delta__pill {
  font-family: 'Inter', system-ui, sans-serif;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  padding: 2px 6px;
  border-radius: 3px;
  background: #fbe0e0;
  color: #9a2828;
}
</style>
