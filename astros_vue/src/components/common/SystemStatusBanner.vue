<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useSystemStatusStore } from '@/stores/systemStatus';
import type { ReadOnlyReasonCode } from '@/types/systemStatus';

const { t } = useI18n();
const systemStatusStore = useSystemStatusStore();

// Allowlist of codes the client knows how to localize. Anything else (including
// null and codes added on the server before the client catches up) falls back
// to UNKNOWN so we never leak a raw i18n key path to the operator.
const KNOWN_CODES: readonly ReadOnlyReasonCode[] = [
  'STARTUP_OPEN_FAILED',
  'BACKUP_FAILED',
  'MIGRATION_FAILED_NO_BACKUP',
  'MIGRATION_FAILED_RESTORED',
  'MIGRATION_FAILED_RESTORE_FAILED',
];

const reasonMessage = computed(() => {
  const code = systemStatusStore.reasonCode;
  if (code && KNOWN_CODES.includes(code)) {
    return t(`systemStatus.reasonCode.${code}`);
  }
  return t('systemStatus.reasonCode.UNKNOWN');
});
</script>

<template>
  <div
    v-if="systemStatusStore.readOnly"
    class="alert alert-warning rounded-none"
    role="status"
    aria-live="polite"
  >
    <span class="font-bold">{{ $t('systemStatus.readOnly.title') }}</span>
    <span>{{ reasonMessage }}</span>
  </div>
</template>
