<script setup lang="ts">
import { computed, watchEffect } from 'vue';
import { useI18n } from 'vue-i18n';
import { storeToRefs } from 'pinia';
import { useFirmwareStore } from '@/stores/firmware';
import AstrosFirmwareControllerRow from '../firmwareControllerRow/AstrosFirmwareControllerRow.vue';
import AstrosFirmwareButton from '../firmwareButton/AstrosFirmwareButton.vue';
import type { ControllersPanelProps } from './types';

const props = defineProps<ControllersPanelProps>();
const emit = defineEmits<{
  flash: [];
  'view-logs': [];
  done: [];
}>();

const { t } = useI18n();
const firmware = useFirmwareStore();
const {
  controllers,
  selectedControllerIds,
  target,
  canFlash,
  anyDowngradeBlocked,
  anyFleetDowngrade,
  allowDowngrade,
  flashError,
} = storeToRefs(firmware);

const flashErrorMessage = computed(() => {
  const err = flashError.value;
  if (err === null) return null;
  // The job_already_running key has a with-id variant that gracefully omits
  // the parenthetical when the server doesn't include currentJobId.
  if (err.reason === 'job_already_running' && err.currentJobId) {
    return t('firmware_view.flash_errors.job_already_running_with_id', {
      jobId: err.currentJobId,
    });
  }
  return t(`firmware_view.flash_errors.${err.reason}`);
});

const rowMode = computed<'select' | 'progress'>(() =>
  props.phase === 'select' ? 'select' : 'progress',
);

// Dev-only invariant warnings. Surface wiring bugs when the panel is driven
// by the WS dispatcher; production strips the block via Vite tree-shake.
if (import.meta.env.DEV) {
  watchEffect(() => {
    if (props.phase !== 'select' && target.value === null) {
      console.warn(
        `[AstrosFirmwareControllersPanel] target is null during phase="${props.phase}"; ` +
          `parent should ensure a target is set whenever phase !== 'select'.`,
      );
    }
    if (props.phase !== 'select' && props.progressByControllerId === undefined) {
      console.warn(
        `[AstrosFirmwareControllersPanel] progressByControllerId is undefined during ` +
          `phase="${props.phase}"; rows will render with no status pill.`,
      );
    }
    if (props.phase !== 'select' && props.progressByControllerId !== undefined) {
      const missing = controllers.value
        .filter((c) => props.progressByControllerId?.[c.id] === undefined)
        .map((c) => c.id);
      if (missing.length > 0) {
        console.warn(
          `[AstrosFirmwareControllersPanel] progressByControllerId is missing entries for ` +
            `${missing.join(', ')} during phase="${props.phase}".`,
        );
      }
    }
  });
}

const actionBarMessage = computed(() => {
  if (target.value === null) return t('firmware_view.controllers.action_bar.no_source');
  if (selectedControllerIds.value.size === 0)
    return t('firmware_view.controllers.action_bar.no_selection');
  return t('firmware_view.controllers.action_bar.push_summary', {
    target: target.value,
    count: selectedControllerIds.value.size,
  });
});
</script>

<template>
  <section class="astros-firmware-controllers-panel">
    <header class="astros-firmware-controllers-panel__header">
      <span class="astros-firmware-controllers-panel__eyebrow">
        {{ t('firmware_view.controllers.eyebrow_title') }}
      </span>
      <div
        v-if="phase === 'select'"
        class="astros-firmware-controllers-panel__header-actions"
      >
        <!--
          Contextual reveal: the "Allow downgrades" toggle only renders when
          the current target would actually downgrade at least one fleet
          member. For pure-upgrade flows the toggle stays hidden — keeps the
          routine path uncluttered and makes the affordance discoverable
          exactly where the disabled-checkbox frustration would surface.
          The phase=='select' gate is inherited from the wrapping v-if on
          header-actions; no second guard needed here.
        -->
        <label
          v-if="anyFleetDowngrade"
          class="astros-firmware-controllers-panel__allow-downgrade"
        >
          <input
            type="checkbox"
            class="astros-firmware-controllers-panel__allow-downgrade-checkbox"
            :checked="allowDowngrade"
            aria-describedby="astros-firmware-controllers-panel__allow-downgrade-help"
            @change="firmware.allowDowngrade = ($event.target as HTMLInputElement).checked"
          />
          <span>{{ t('firmware_view.controllers.allow_downgrade.toggle_label') }}</span>
          <!--
            Help text is sr-only because the toggle's visible label is
            already self-explanatory; the description is for AT users who
            land on the checkbox via keyboard navigation. A `title=` would
            duplicate this text to AT (announced via accessible-description),
            causing the screen reader to stutter — so we omit it.
          -->
          <span
            id="astros-firmware-controllers-panel__allow-downgrade-help"
            class="sr-only"
            >{{ t('firmware_view.controllers.allow_downgrade.toggle_help') }}</span
          >
        </label>
        <button
          type="button"
          class="astros-firmware-controllers-panel__ghost-btn"
          @click="firmware.selectAll()"
        >
          {{ t('firmware_view.controllers.select_all') }}
        </button>
        <button
          type="button"
          class="astros-firmware-controllers-panel__ghost-btn"
          @click="firmware.clear()"
        >
          {{ t('firmware_view.controllers.clear') }}
        </button>
      </div>
    </header>

    <ul class="astros-firmware-controllers-panel__rows">
      <li
        v-for="c in controllers"
        :key="c.id"
        class="astros-firmware-controllers-panel__row-wrap"
      >
        <AstrosFirmwareControllerRow
          :controller="c"
          :target="target"
          :mode="rowMode"
          :selected="selectedControllerIds.has(c.id)"
          :allow-downgrade="allowDowngrade"
          :progress-status="progressByControllerId?.[c.id]?.status"
          :stage-label-key="progressByControllerId?.[c.id]?.stageLabelKey"
          @toggle="firmware.toggle"
        />
      </li>
    </ul>

    <div
      v-if="phase === 'select' && flashError !== null"
      class="astros-firmware-controllers-panel__error-banner"
      role="alert"
      aria-live="polite"
    >
      <div class="astros-firmware-controllers-panel__error-text">
        <span class="astros-firmware-controllers-panel__error-title">{{
          t('firmware_view.controllers.flash_error_banner.title')
        }}</span>
        <span class="astros-firmware-controllers-panel__error-detail">{{ flashErrorMessage }}</span>
      </div>
      <div class="astros-firmware-controllers-panel__error-actions">
        <AstrosFirmwareButton
          kind="ghost"
          @click="firmware.dismissError()"
        >
          {{ t('firmware_view.controllers.flash_error_banner.dismiss') }}
        </AstrosFirmwareButton>
        <AstrosFirmwareButton
          kind="secondary"
          :disabled="!canFlash"
          @click="canFlash && emit('flash')"
        >
          {{ t('firmware_view.controllers.flash_error_banner.retry') }}
        </AstrosFirmwareButton>
      </div>
    </div>

    <footer
      v-if="phase === 'select'"
      class="astros-firmware-controllers-panel__action-bar astros-firmware-controllers-panel__bar--select"
    >
      <div class="astros-firmware-controllers-panel__action-bar-text">
        <span>{{ actionBarMessage }}</span>
        <span
          v-if="anyDowngradeBlocked"
          class="astros-firmware-controllers-panel__action-bar-downgrade"
        >
          {{ t('firmware_view.controllers.action_bar.downgrade_blocked') }}
        </span>
      </div>
      <AstrosFirmwareButton
        kind="primary"
        :disabled="!canFlash"
        @click="canFlash && emit('flash')"
      >
        {{ t('firmware_view.controllers.action_bar.flash_button') }}
      </AstrosFirmwareButton>
    </footer>

    <footer
      v-else-if="phase === 'done'"
      class="astros-firmware-controllers-panel__action-bar astros-firmware-controllers-panel__bar--done"
    >
      <span
        class="astros-firmware-controllers-panel__result-text astros-firmware-controllers-panel__result-text--done"
      >
        {{
          t('firmware_view.controllers.result_bar.all_updated', {
            count: doneCount ?? selectedControllerIds.size,
          })
        }}
      </span>
      <div class="astros-firmware-controllers-panel__action-bar-buttons">
        <AstrosFirmwareButton
          kind="secondary"
          @click="emit('view-logs')"
        >
          {{ t('firmware_view.controllers.result_bar.view_logs') }}
        </AstrosFirmwareButton>
        <AstrosFirmwareButton
          kind="primary"
          @click="emit('done')"
        >
          {{ t('firmware_view.controllers.result_bar.done') }}
        </AstrosFirmwareButton>
      </div>
    </footer>

    <footer
      v-else-if="phase === 'failed'"
      class="astros-firmware-controllers-panel__action-bar astros-firmware-controllers-panel__bar--failed"
    >
      <span
        class="astros-firmware-controllers-panel__result-text astros-firmware-controllers-panel__result-text--failed"
      >
        {{
          // Use the multi-failure copy for >=2 AND for 0 (pre-streamer
          // abort: job failed before any controller transitioned to FAILED;
          // the singular key's `{stage}` placeholder would render '—').
          (failedCount ?? 1) !== 1
            ? t('firmware_view.controllers.result_bar.failed_summary_multi', {
                labels: failedControllerLabel ?? '—',
              })
            : t('firmware_view.controllers.result_bar.failed_summary', {
                label: failedControllerLabel ?? '—',
                stage: failedStage ? t(`firmware_view.stages.${failedStage}.label`) : '—',
              })
        }}
      </span>
      <div class="astros-firmware-controllers-panel__action-bar-buttons">
        <AstrosFirmwareButton
          kind="secondary"
          @click="emit('view-logs')"
        >
          {{ t('firmware_view.controllers.result_bar.view_logs') }}
        </AstrosFirmwareButton>
        <AstrosFirmwareButton
          kind="primary"
          @click="emit('done')"
        >
          {{ t('firmware_view.controllers.result_bar.done') }}
        </AstrosFirmwareButton>
      </div>
    </footer>
  </section>
</template>

<style scoped>
.astros-firmware-controllers-panel {
  display: flex;
  flex-direction: column;
  background: #ffffff;
  border: 1px solid #d6e0e6;
  border-radius: 6px;
  align-self: flex-start;
  font-family: 'Inter', system-ui, sans-serif;
}

.astros-firmware-controllers-panel__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 14px;
  background: #f6f9fb;
  border-bottom: 1px solid #d6e0e6;
  border-top-left-radius: 6px;
  border-top-right-radius: 6px;
}

.astros-firmware-controllers-panel__eyebrow {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #4b5b73;
}

.astros-firmware-controllers-panel__header-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.astros-firmware-controllers-panel__allow-downgrade {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  font-weight: 600;
  color: #4b5b73;
  padding: 4px 8px;
  border-radius: 3px;
  cursor: pointer;
  user-select: none;
  border: 1px solid transparent;
  transition: background 0.15s linear;
}

.astros-firmware-controllers-panel__allow-downgrade:hover {
  background: #eef3fa;
}

.astros-firmware-controllers-panel__allow-downgrade-checkbox {
  accent-color: #9a2828;
  margin: 0;
  cursor: pointer;
}

.astros-firmware-controllers-panel__allow-downgrade:focus-within {
  outline: 2px solid #7d92b8;
  outline-offset: 2px;
}

.astros-firmware-controllers-panel__ghost-btn {
  appearance: none;
  background: transparent;
  border: 1px solid transparent;
  font-family: inherit;
  font-size: 11px;
  font-weight: 600;
  color: #4b5b73;
  padding: 6px 10px;
  border-radius: 3px;
  cursor: pointer;
  transition: background 0.15s linear;
}

.astros-firmware-controllers-panel__ghost-btn:hover {
  background: #eef3fa;
}

.astros-firmware-controllers-panel__ghost-btn:focus-visible {
  outline: 2px solid #7d92b8;
  outline-offset: 2px;
}

.astros-firmware-controllers-panel__rows {
  list-style: none;
  margin: 0;
  padding: 0;
}

.astros-firmware-controllers-panel__row-wrap:last-child :deep(.astros-firmware-controller-row) {
  border-bottom: none;
}

.astros-firmware-controllers-panel__action-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px;
  border-bottom-left-radius: 6px;
  border-bottom-right-radius: 6px;
}

.astros-firmware-controllers-panel__bar--select {
  background: #f6f9fb;
  border-top: 1px solid #d6e0e6;
}

.astros-firmware-controllers-panel__bar--done {
  background: #dcf2e6;
  border-top: 1px solid #3aa67655;
}

.astros-firmware-controllers-panel__bar--failed {
  background: #fbe0e0;
  border-top: 1px solid #cf424255;
}

.astros-firmware-controllers-panel__action-bar-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 12px;
  color: #4b5b73;
}

.astros-firmware-controllers-panel__action-bar-downgrade {
  font-size: 12px;
  font-weight: 600;
  color: #9a2828;
}

.astros-firmware-controllers-panel__action-bar-buttons {
  display: flex;
  gap: 8px;
}

.astros-firmware-controllers-panel__result-text {
  font-size: 12px;
  font-weight: 600;
}

.astros-firmware-controllers-panel__result-text--done {
  color: #1f6e44;
}

.astros-firmware-controllers-panel__result-text--failed {
  color: #9a2828;
}

.astros-firmware-controllers-panel__error-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
  background: #fbe0e0;
  border-top: 1px solid #cf424255;
}

.astros-firmware-controllers-panel__error-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.astros-firmware-controllers-panel__error-title {
  font-size: 12px;
  font-weight: 700;
  color: #9a2828;
}

.astros-firmware-controllers-panel__error-detail {
  font-size: 11px;
  color: #9a2828;
}

.astros-firmware-controllers-panel__error-actions {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
}
</style>
