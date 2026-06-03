<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useSystemStatusStore } from '@/stores/systemStatus';
import { useJobLockStore } from '@/stores/jobLock';

interface Props {
  // Optional caller-supplied disabled state (loading, validation, etc.).
  // ORed with the system read-only state and the firmware-job lock so
  // callers don't lose capability vs. the hand-rolled inline pattern this
  // component replaces.
  disabled?: boolean;
}

const props = withDefaults(defineProps<Props>(), { disabled: false });

const { t } = useI18n();
const systemStatusStore = useSystemStatusStore();
const jobLockStore = useJobLockStore();

const isReadOnlyDisabled = computed(() => systemStatusStore.readOnly);
const isJobLockDisabled = computed(() => jobLockStore.locked);
const isDisabled = computed(
  () => props.disabled || isReadOnlyDisabled.value || isJobLockDisabled.value,
);

// Tooltip priority: system read-only is broader than a flash lock, so it
// takes precedence when both are active.
const tooltipKey = computed(() => {
  if (isReadOnlyDisabled.value) return 'systemStatus.readOnly.disabled';
  if (isJobLockDisabled.value) return 'firmware_view.lock_active';
  return null;
});

// Route every other attribute (class, data-testid, type, aria-*) onto the
// inner button rather than the wrapper div. Without this, Vue would default
// to setting them on the root element of the template — which is the tooltip
// wrapper, not the button.
defineOptions({ inheritAttrs: false });
</script>

<template>
  <div
    :class="tooltipKey !== null ? 'tooltip' : ''"
    :data-tip="tooltipKey !== null ? t(tooltipKey) : undefined"
  >
    <button
      v-bind="$attrs"
      :disabled="isDisabled"
    >
      <slot />
    </button>
  </div>
</template>
