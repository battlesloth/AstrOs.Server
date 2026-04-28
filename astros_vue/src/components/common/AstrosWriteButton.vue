<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useSystemStatusStore } from '@/stores/systemStatus';

interface Props {
  // Optional caller-supplied disabled state (loading, validation, etc.).
  // ORed with the system read-only state so callers don't lose capability
  // vs. the hand-rolled inline pattern this component replaces.
  disabled?: boolean;
}

const props = withDefaults(defineProps<Props>(), { disabled: false });

const { t } = useI18n();
const systemStatusStore = useSystemStatusStore();

const isReadOnlyDisabled = computed(() => systemStatusStore.readOnly);
const isDisabled = computed(() => props.disabled || isReadOnlyDisabled.value);

// Route every other attribute (class, data-testid, type, aria-*) onto the
// inner button rather than the wrapper div. Without this, Vue would default
// to setting them on the root element of the template — which is the tooltip
// wrapper, not the button.
defineOptions({ inheritAttrs: false });
</script>

<template>
  <div
    :class="isReadOnlyDisabled ? 'tooltip' : ''"
    :data-tip="t('systemStatus.readOnly.disabled')"
  >
    <button
      v-bind="$attrs"
      :disabled="isDisabled"
    >
      <slot />
    </button>
  </div>
</template>
