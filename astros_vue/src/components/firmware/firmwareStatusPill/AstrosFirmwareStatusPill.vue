<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { FirmwareStatusPillKind } from '@/types/firmware';

const props = defineProps<{ kind: FirmwareStatusPillKind }>();

const { t } = useI18n();

const KIND_LABEL_KEY: Record<FirmwareStatusPillKind, string> = {
  idle: 'firmware_view.controllers.pill.idle',
  queued: 'firmware_view.controllers.pill.queued',
  updating: 'firmware_view.controllers.pill.updating',
  done: 'firmware_view.controllers.pill.done',
  failed: 'firmware_view.controllers.pill.failed',
  upToDate: 'firmware_view.controllers.pill.up_to_date',
  offline: 'firmware_view.controllers.pill.offline',
  downgrade: 'firmware_view.controllers.pill.downgrade',
};

const KIND_MODIFIER: Record<FirmwareStatusPillKind, string> = {
  idle: 'idle',
  queued: 'queued',
  updating: 'updating',
  done: 'done',
  failed: 'failed',
  upToDate: 'up-to-date',
  offline: 'offline',
  downgrade: 'downgrade',
};

const modifierClass = computed(() => `astros-firmware-status-pill--${KIND_MODIFIER[props.kind]}`);
</script>

<template>
  <span :class="['astros-firmware-status-pill', modifierClass]">
    {{ t(KIND_LABEL_KEY[kind]) }}
  </span>
</template>

<style scoped>
.astros-firmware-status-pill {
  display: inline-flex;
  align-items: center;
  font-family: 'Inter', system-ui, sans-serif;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  padding: 3px 8px;
  border-radius: 999px;
  white-space: nowrap;
}

.astros-firmware-status-pill--idle {
  background: #e6edf2;
  color: #4b5b73;
}

.astros-firmware-status-pill--queued {
  background: #e8eef7;
  color: #3a4a6b;
}

.astros-firmware-status-pill--updating {
  background: #fff3dc;
  color: #7d5a14;
}

.astros-firmware-status-pill--done,
.astros-firmware-status-pill--up-to-date {
  background: #dcf2e6;
  color: #1f6e44;
}

.astros-firmware-status-pill--failed,
.astros-firmware-status-pill--offline,
.astros-firmware-status-pill--downgrade {
  background: #fbe0e0;
  color: #9a2828;
}
</style>
