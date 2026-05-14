<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { useJobLockStore } from '@/stores/jobLock';
import { useFirmwareStore } from '@/stores/firmware';
import { useSystemStatusStore } from '@/stores/systemStatus';

const jobLockStore = useJobLockStore();
const firmwareStore = useFirmwareStore();
const systemStatusStore = useSystemStatusStore();
const route = useRoute();

// Show the banner when a flash is in flight UNLESS:
// - this view owns the flash (FirmwareView shows its own in-context UI), or
// - systemStatus.readOnly is already telling the operator writes are off
//   (broader condition wins — same precedence as AstrosWriteButton's tooltip).
const visible = computed(
  () => jobLockStore.locked && !firmwareStore.isOwnJob && !systemStatusStore.readOnly,
);

// Don't link to /firmware when the operator is already there. isOwnJob
// covers the common case, but the lock can briefly outlast the firmware
// store's currentJob during the heartbeat-resolved release path; in that
// race window the banner can render on /firmware itself and the CTA would
// be a self-link.
const showCta = computed(() => route.path !== '/firmware');
</script>

<template>
  <!--
    role="status" (not "alert"): ambient cross-page indicator, not an
    interrupt. FirmwareView's in-page lock-conflict region uses role="alert"
    because it blocks operator interaction with the flash UI; this banner
    is informational background context.
  -->
  <div
    v-if="visible"
    class="alert alert-info rounded-none"
    role="status"
    aria-live="polite"
  >
    <span>{{ $t('firmware_view.lock_banner') }}</span>
    <RouterLink
      v-if="showCta"
      to="/firmware"
      class="link link-hover font-semibold ml-2"
      data-testid="lock-banner-cta"
    >
      {{ $t('firmware_view.lock_banner_cta') }}
    </RouterLink>
  </div>
</template>
