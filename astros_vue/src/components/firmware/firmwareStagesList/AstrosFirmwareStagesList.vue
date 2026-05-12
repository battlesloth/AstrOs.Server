<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { FIRMWARE_STAGES, stageRowState, type StageRowState } from './stageRowState';
import type { FirmwarePhase, FirmwareStage } from '@/types/firmware';

const props = defineProps<{
  phase: FirmwarePhase;
  currentStage: FirmwareStage | null;
  failedStage?: FirmwareStage | null;
}>();

const { t } = useI18n();

interface StageRow {
  stage: FirmwareStage;
  state: StageRowState;
  index: number;
  label: string;
  hint: string;
}

const rows = computed<StageRow[]>(() =>
  FIRMWARE_STAGES.map((stage, i) => ({
    stage,
    state: stageRowState({
      stage,
      phase: props.phase,
      currentStage: props.currentStage,
      failedStage: props.failedStage ?? null,
    }),
    index: i + 1,
    label: t(`firmware_view.stages.${stage}.label`),
    hint: t(`firmware_view.stages.${stage}.hint`),
  })),
);
</script>

<template>
  <section
    class="astros-firmware-stages-list"
    role="list"
    :aria-label="t('firmware_view.stages.eyebrow_title')"
  >
    <header class="astros-firmware-stages-list__header">
      <span class="astros-firmware-stages-list__eyebrow">{{
        t('firmware_view.stages.eyebrow_title')
      }}</span>
    </header>
    <ul class="astros-firmware-stages-list__rows">
      <li
        v-for="row in rows"
        :key="row.stage"
        :class="[
          'astros-firmware-stages-list__row',
          `astros-firmware-stages-list__row--${row.state}`,
        ]"
        role="listitem"
        :aria-current="row.state === 'current' ? 'step' : undefined"
        :aria-invalid="row.state === 'failed' ? 'true' : undefined"
      >
        <span
          :class="[
            'astros-firmware-stages-list__bullet',
            `astros-firmware-stages-list__bullet--${row.state}`,
          ]"
          aria-hidden="true"
        >
          <template v-if="row.state === 'done'">✓</template>
          <template v-else-if="row.state === 'failed'">!</template>
          <template v-else>{{ row.index }}</template>
        </span>
        <div class="astros-firmware-stages-list__text">
          <span
            :class="[
              'astros-firmware-stages-list__label',
              `astros-firmware-stages-list__label--${row.state}`,
            ]"
          >
            {{ row.label }}
          </span>
          <span class="astros-firmware-stages-list__hint">{{ row.hint }}</span>
        </div>
        <span
          v-if="row.state === 'current'"
          class="astros-firmware-stages-list__in-progress"
        >
          {{ t('firmware_view.stages.in_progress') }}
        </span>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.astros-firmware-stages-list {
  display: flex;
  flex-direction: column;
  background: #ffffff;
  border: 1px solid #d6e0e6;
  border-radius: 6px;
  font-family: 'Inter', system-ui, sans-serif;
}

.astros-firmware-stages-list__header {
  padding: 10px 14px;
  background: #f6f9fb;
  border-bottom: 1px solid #d6e0e6;
  border-top-left-radius: 6px;
  border-top-right-radius: 6px;
}

.astros-firmware-stages-list__eyebrow {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #4b5b73;
}

.astros-firmware-stages-list__rows {
  list-style: none;
  margin: 0;
  padding: 0;
}

.astros-firmware-stages-list__row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  border-top: 1px solid #d6e0e6;
}

.astros-firmware-stages-list__row:first-child {
  border-top: none;
}

.astros-firmware-stages-list__row--current {
  background: #fff8e8;
}

.astros-firmware-stages-list__row--failed {
  background: #fbe0e0;
}

.astros-firmware-stages-list__bullet {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  font-size: 10px;
  font-weight: 700;
  flex-shrink: 0;
}

.astros-firmware-stages-list__bullet--idle {
  background: #e3edf2;
  color: #4b5b73;
}

.astros-firmware-stages-list__bullet--done {
  background: #3aa676;
  color: #ffffff;
}

.astros-firmware-stages-list__bullet--current {
  background: #e5a93a;
  color: #ffffff;
}

.astros-firmware-stages-list__bullet--failed {
  background: #cf4242;
  color: #ffffff;
}

.astros-firmware-stages-list__text {
  display: flex;
  flex-direction: column;
  gap: 1px;
  flex: 1;
  min-width: 0;
}

.astros-firmware-stages-list__label {
  font-size: 12px;
  font-weight: 600;
  color: #0e1726;
}

.astros-firmware-stages-list__label--failed {
  color: #9a2828;
}

.astros-firmware-stages-list__hint {
  font-size: 10px;
  color: #4b5b73;
}

.astros-firmware-stages-list__in-progress {
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: #7d5a14;
}
</style>
