<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import AstrosFirmwareVersionDelta from '../firmwareVersionDelta/AstrosFirmwareVersionDelta.vue';
import AstrosFirmwareStatusPill from '../firmwareStatusPill/AstrosFirmwareStatusPill.vue';
import { selectModePillKind as computePillKind } from './selectModePillKind';
import type { ControllerRowProps } from './types';

const props = defineProps<ControllerRowProps>();
const emit = defineEmits<{ toggle: [id: string] }>();

const { t } = useI18n();

const pillKind = computed(() =>
  computePillKind({ controller: props.controller, target: props.target }),
);

const blocked = computed(() => pillKind.value === 'offline' || pillKind.value === 'downgrade');

const statusDotAriaLabel = computed(() => {
  const statusKey = `firmware_view.controllers.status_${
    props.controller.status === 'needsSynced' ? 'needs_synced' : props.controller.status
  }`;
  return t('firmware_view.controllers.status_dot_aria', {
    label: props.controller.label,
    status: t(statusKey),
  });
});

function onCheckboxChange() {
  emit('toggle', props.controller.id);
}
</script>

<template>
  <div :class="['astros-firmware-controller-row', { 'is-blocked': mode === 'select' && blocked }]">
    <label
      v-if="mode === 'select'"
      class="astros-firmware-controller-row__checkbox-wrap"
    >
      <input
        type="checkbox"
        class="astros-firmware-controller-row__checkbox"
        :checked="selected"
        :disabled="blocked"
        :aria-label="t('firmware_view.controllers.row_select_aria', { label: controller.label })"
        @change="onCheckboxChange"
      />
    </label>

    <span
      :class="[
        'astros-firmware-controller-row__badge',
        controller.isMaster
          ? 'astros-firmware-controller-row__badge--master'
          : 'astros-firmware-controller-row__badge--padawan',
      ]"
      aria-hidden="true"
    >
      {{ controller.glyph }}
    </span>

    <div class="astros-firmware-controller-row__middle">
      <div class="astros-firmware-controller-row__top">
        <span class="astros-firmware-controller-row__name">{{ controller.label }}</span>
        <span
          v-if="controller.isMaster"
          class="astros-firmware-controller-row__master-pill"
        >
          {{ t('firmware_view.controllers.master_pill') }}
        </span>
        <span
          :class="[
            'astros-firmware-controller-row__status-dot',
            `astros-firmware-controller-row__status-dot--${controller.status === 'needsSynced' ? 'needs-synced' : controller.status}`,
          ]"
          role="img"
          :aria-label="statusDotAriaLabel"
        />
      </div>
      <AstrosFirmwareVersionDelta
        :current="controller.current"
        :target="target"
      />
    </div>

    <div class="astros-firmware-controller-row__right">
      <template v-if="mode === 'select'">
        <AstrosFirmwareStatusPill
          v-if="pillKind"
          :kind="pillKind"
        />
      </template>
      <template v-else-if="progressStatus">
        <AstrosFirmwareStatusPill :kind="progressStatus" />
        <span
          v-if="progressStatus === 'updating' && stageLabel"
          class="astros-firmware-controller-row__stage"
          >{{ stageLabel }}</span
        >
      </template>
    </div>
  </div>
</template>

<style scoped>
.astros-firmware-controller-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  border-bottom: 1px solid #d6e0e6;
  background: #ffffff;
  font-family: 'Inter', system-ui, sans-serif;
}

.astros-firmware-controller-row.is-blocked {
  opacity: 0.6;
}

.astros-firmware-controller-row__checkbox-wrap {
  display: inline-flex;
  align-items: center;
}

.astros-firmware-controller-row__checkbox {
  width: 16px;
  height: 16px;
  accent-color: #2a5a97;
  cursor: pointer;
}

.astros-firmware-controller-row__checkbox:disabled {
  cursor: not-allowed;
}

.astros-firmware-controller-row__badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border-radius: 4px;
  font-family: ui-monospace, 'SF Mono', monospace;
  font-weight: 700;
  font-size: 14px;
  flex-shrink: 0;
}

.astros-firmware-controller-row__badge--master {
  background: #2a5a97;
  color: #ffffff;
}

.astros-firmware-controller-row__badge--padawan {
  background: #cbdce1;
  color: #2a5a97;
}

.astros-firmware-controller-row__middle {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1;
  min-width: 0;
}

.astros-firmware-controller-row__top {
  display: flex;
  align-items: center;
  gap: 8px;
}

.astros-firmware-controller-row__name {
  font-size: 13px;
  font-weight: 700;
  color: #0e1726;
}

.astros-firmware-controller-row__master-pill {
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  padding: 2px 6px;
  border-radius: 3px;
  background: #e8eef7;
  color: #2a5a97;
}

.astros-firmware-controller-row__status-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  box-shadow: 0 0 0 2px #ffffff;
}

.astros-firmware-controller-row__status-dot--up {
  background: #3aa676;
}

.astros-firmware-controller-row__status-dot--down {
  background: #cf4242;
}

.astros-firmware-controller-row__status-dot--needs-synced {
  background: #e5a93a;
}

.astros-firmware-controller-row__right {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
  flex-shrink: 0;
}

.astros-firmware-controller-row__stage {
  font-family: ui-monospace, 'SF Mono', monospace;
  font-size: 10px;
  color: #4b5b73;
}
</style>
