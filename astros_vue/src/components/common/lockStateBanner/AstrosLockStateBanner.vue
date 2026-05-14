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
// - the operator is currently on /firmware (it has its own role="alert"
//   lock-conflict region; doubling up risks contradicting it when
//   firmwareStore.currentJob clears just before jobLockStore.locked flips
//   false during heartbeat-resolved release), or
// - systemStatus.readOnly is already telling the operator writes are off
//   (broader condition wins — same precedence as AstrosWriteButton's tooltip).
const visible = computed(
  () =>
    jobLockStore.locked &&
    !firmwareStore.isOwnJob &&
    route.path !== '/firmware' &&
    !systemStatusStore.readOnly,
);
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
      to="/firmware"
      class="link link-hover font-semibold ml-2"
      data-testid="lock-banner-cta"
    >
      {{ $t('firmware_view.lock_banner_cta') }}
    </RouterLink>
  </div>
</template>
