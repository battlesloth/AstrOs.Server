<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { StageColumnModel } from '@/utils/firmwareStageBoard';

const props = defineProps<{ column: StageColumnModel }>();
const { t } = useI18n();

const roleLabel = computed(() => {
  switch (props.column.role) {
    case 'master':
      return t('firmware_view.topology.role_master');
    case 'padawan':
      return t('firmware_view.topology.role_padawan');
    case 'idle':
      return t('firmware_view.stages.not_in_update');
  }
  return '';
});
</script>

<template>
  <div
    :class="[
      'astros-firmware-stage-column',
      { 'astros-firmware-stage-column--idle': column.role === 'idle' },
    ]"
    role="group"
    :aria-label="`${column.label} ${roleLabel}`"
  >
    <header class="astros-firmware-stage-column__header">
      <span
        :class="[
          'astros-firmware-stage-column__badge',
          column.isMaster
            ? 'astros-firmware-stage-column__badge--master'
            : 'astros-firmware-stage-column__badge--padawan',
        ]"
        aria-hidden="true"
        >{{ column.glyph }}</span
      >
      <div class="astros-firmware-stage-column__id">
        <span class="astros-firmware-stage-column__name">{{ column.label }}</span>
        <span class="astros-firmware-stage-column__role">{{ roleLabel }}</span>
      </div>
    </header>

    <ul
      class="astros-firmware-stage-column__rows"
      role="list"
    >
      <li
        v-for="row in column.rows"
        :key="row.stage"
        :class="[
          'astros-firmware-stage-column__row',
          `astros-firmware-stage-column__row--${row.state}`,
        ]"
        role="listitem"
        :aria-current="row.state === 'current' ? 'step' : undefined"
        :aria-invalid="row.state === 'failed' ? 'true' : undefined"
      >
        <span
          :class="[
            'astros-firmware-stage-column__bullet',
            `astros-firmware-stage-column__bullet--${row.state}`,
          ]"
          aria-hidden="true"
        >
          <template v-if="row.state === 'done'">✓</template>
          <template v-else-if="row.state === 'failed'">!</template>
          <template v-else-if="row.state === 'na'">—</template>
          <template v-else>{{ row.index }}</template>
        </span>
        <div class="astros-firmware-stage-column__text">
          <span class="astros-firmware-stage-column__label">{{ t(row.labelKey) }}</span>
          <span class="astros-firmware-stage-column__hint">{{ t(row.hintKey) }}</span>
        </div>
        <span
          v-if="row.state === 'current'"
          class="astros-firmware-stage-column__progress astros-firmware-stage-column__progress--current"
        >
          <template v-if="row.percent !== null">{{ row.percent }}%</template>
          <template v-else>{{ t('firmware_view.stages.in_progress') }}</template>
        </span>
        <span
          v-else-if="row.percent !== null"
          class="astros-firmware-stage-column__progress astros-firmware-stage-column__progress--done"
          >{{ row.percent }}%</span
        >
      </li>
    </ul>
  </div>
</template>

<style scoped>
.astros-firmware-stage-column {
  display: flex;
  flex-direction: column;
  background: #ffffff;
  border: 1px solid #d6e0e6;
  border-radius: 6px;
  font-family: 'Inter', system-ui, sans-serif;
  min-width: 0;
}

.astros-firmware-stage-column--idle {
  opacity: 0.55;
}

.astros-firmware-stage-column__header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  border-bottom: 1px solid #d6e0e6;
}

.astros-firmware-stage-column__badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: 4px;
  font-family: ui-monospace, 'SF Mono', monospace;
  font-weight: 700;
  font-size: 13px;
  flex-shrink: 0;
}

.astros-firmware-stage-column__badge--master {
  background: #2a5a97;
  color: #ffffff;
}

.astros-firmware-stage-column__badge--padawan {
  background: #cbdce1;
  color: #2a5a97;
}

.astros-firmware-stage-column__id {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.astros-firmware-stage-column__name {
  font-size: 13px;
  font-weight: 700;
  color: #0e1726;
}

.astros-firmware-stage-column__role {
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: #4b5b73;
}

.astros-firmware-stage-column__rows {
  list-style: none;
  margin: 0;
  padding: 0;
}

.astros-firmware-stage-column__row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  border-top: 1px solid #eef3f6;
}

.astros-firmware-stage-column__row:first-child {
  border-top: none;
}

.astros-firmware-stage-column__row--current {
  background: #fff8e8;
}

.astros-firmware-stage-column__row--failed {
  background: #fbe0e0;
}

.astros-firmware-stage-column__bullet {
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

.astros-firmware-stage-column__bullet--idle,
.astros-firmware-stage-column__bullet--na {
  background: #e3edf2;
  color: #4b5b73;
}

.astros-firmware-stage-column__bullet--done {
  background: #3aa676;
  color: #ffffff;
}

.astros-firmware-stage-column__bullet--current {
  background: #e5a93a;
  color: #ffffff;
}

.astros-firmware-stage-column__bullet--failed {
  background: #cf4242;
  color: #ffffff;
}

.astros-firmware-stage-column__text {
  display: flex;
  flex-direction: column;
  gap: 1px;
  flex: 1;
  min-width: 0;
}

.astros-firmware-stage-column__label {
  font-size: 12px;
  font-weight: 600;
  color: #0e1726;
}

.astros-firmware-stage-column__row--na .astros-firmware-stage-column__label,
.astros-firmware-stage-column__row--na .astros-firmware-stage-column__hint {
  color: #93a3b3;
}

.astros-firmware-stage-column__hint {
  font-size: 10px;
  color: #4b5b73;
}

.astros-firmware-stage-column__progress {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.04em;
  flex-shrink: 0;
}

.astros-firmware-stage-column__progress--current {
  color: #7d5a14;
  text-transform: uppercase;
}

.astros-firmware-stage-column__progress--done {
  color: #1f6e44;
}
</style>
