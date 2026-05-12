<script setup lang="ts">
import { computed } from 'vue';
import { useJobLockStore } from '@/stores/jobLock';
import { useFirmwareStore } from '@/stores/firmware';

const jobLockStore = useJobLockStore();
const firmwareStore = useFirmwareStore();

// Show the banner globally when a flash is in flight UNLESS this view owns
// the flash. The FirmwareView surfaces its own in-context UI for the active
// job, so doubling up the banner there is just noise.
const visible = computed(() => jobLockStore.locked && !firmwareStore.isOwnJob);
</script>

<template>
  <!--
    role="status" (not "alert") is intentional: this is an ambient
    cross-page indicator that writes are disabled, not an interrupt-class
    notification. The FirmwareView's in-page lock-conflict region uses
    role="alert" because it actively blocks the operator from interacting
    with the flash UI; this banner is informational background context.
  -->
  <div
    v-if="visible"
    class="alert alert-info rounded-none"
    role="status"
    aria-live="polite"
  >
    <span>{{ $t('firmware_view.lock_banner') }}</span>
  </div>
</template>
