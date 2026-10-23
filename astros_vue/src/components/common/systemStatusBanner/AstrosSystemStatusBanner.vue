<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useSystemStatusStore } from '@/stores/systemStatus';
import type { ReadOnlyReasonCode } from '@/types/systemStatus';

const { t } = useI18n();
const systemStatusStore = useSystemStatusStore();

// Allowlist of codes the client knows how to localize. Anything else (including
// null and codes added on the server before the client catches up) falls back
// to UNKNOWN so we never leak a raw i18n key path to the operator. Keyed by
// every ReadOnlyReasonCode, so a code missing here fails vue-tsc.
const KNOWN_CODES = {
  STARTUP_OPEN_FAILED: true,
  BACKUP_FAILED: true,
  MIGRATION_FAILED_NO_BACKUP: true,
  MIGRATION_FAILED_RESTORED: true,
  MIGRATION_FAILED_RESTORE_FAILED: true,
  DB_NEWER_THAN_SERVER: true,
} as const satisfies Record<ReadOnlyReasonCode, true>;

const reasonMessage = computed(() => {
  const code = systemStatusStore.reasonCode;
  // hasOwnProperty, not `in`: the code comes off the wire unvalidated, and
  // `'toString' in {}` is true.
  if (code && Object.prototype.hasOwnProperty.call(KNOWN_CODES, code)) {
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
