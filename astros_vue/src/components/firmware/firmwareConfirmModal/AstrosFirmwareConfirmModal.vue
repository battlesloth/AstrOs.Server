<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import AstrosFirmwareButton from '../firmwareButton/AstrosFirmwareButton.vue';
import AstrosFirmwareVersionDelta from '../firmwareVersionDelta/AstrosFirmwareVersionDelta.vue';
import { compareTags } from '@/utils/version';
import type { FirmwareControllerView, FirmwareSourceMode } from '@/types/firmware';

const props = defineProps<{
  open: boolean;
  target: string | null;
  selectedControllers: FirmwareControllerView[];
  uploadedFilename?: string | null;
  sourceMode: FirmwareSourceMode;
}>();

const emit = defineEmits<{ cancel: []; confirm: [] }>();

const { t } = useI18n();

const dialogRef = ref<HTMLDialogElement | null>(null);

// Native <dialog>.showModal() handles focus trap, ESC dismissal, and focus
// restore for free. Sync .open prop to the imperative API.
//
// `immediate: true` + `flush: 'post'` ensures a component mounted with
// `open: true` (Storybook args, or a parent that renders it initially open)
// actually calls `.showModal()` — post-flush defers the first run until after
// the dialog element is in the DOM so `dialogRef.value` is populated.
watch(
  () => props.open,
  (open) => {
    const el = dialogRef.value;
    if (!el) return;
    if (open && !el.open) el.showModal();
    else if (!open && el.open) el.close();
    // Reset the downgrade-ack each time the modal opens so the operator
    // must re-confirm on every flash attempt. Otherwise a previous "yes I
    // understand" would silently re-arm the Confirm button for a fresh
    // selection that may or may not contain downgrades.
    if (open) downgradeAck.value = false;
  },
  { immediate: true, flush: 'post' },
);

// Selected controllers that are running newer firmware than the target.
// `compareTags` returns NaN for malformed input or local-build target; both
// safely fall through (`NaN > 0` is false), so this list is naturally empty
// for upload flows and pure-upgrade flows alike.
const downgradeControllers = computed<FirmwareControllerView[]>(() => {
  const t = props.target;
  if (t === null) return [];
  return props.selectedControllers.filter((c) => {
    const cmp = compareTags(c.current, t);
    return !Number.isNaN(cmp) && cmp > 0;
  });
});

const downgradeAck = ref(false);

const requiresDowngradeAck = computed(() => downgradeControllers.value.length > 0);

// Confirm is disabled when (a) the operator has opened the modal with an
// empty selection (a misuse path the parent gate prevents in practice,
// but the modal shouldn't render a clickable Confirm with nothing to do),
// or (b) the selection contains a downgrade and the ack isn't ticked.
const confirmDisabled = computed(
  () =>
    props.selectedControllers.length === 0 || (requiresDowngradeAck.value && !downgradeAck.value),
);

// Browser fires 'cancel' on ESC. Mirror it through our cancel emit so the
// parent's open ref flips to false.
function onDialogCancel(event: Event) {
  event.preventDefault();
  emit('cancel');
}

// Clicks on the dialog element directly (not its children) are clicks on the
// ::backdrop. Use that as a cancel signal.
function onDialogClick(event: MouseEvent) {
  if (event.target === dialogRef.value) emit('cancel');
}

const sourceDisplay = (): string => {
  if (props.sourceMode === 'github') return props.target ?? '—';
  return props.uploadedFilename ?? '—';
};
</script>

<template>
  <dialog
    ref="dialogRef"
    class="astros-firmware-confirm-modal"
    aria-labelledby="astros-firmware-confirm-modal-title"
    @cancel="onDialogCancel"
    @click="onDialogClick"
  >
    <div class="astros-firmware-confirm-modal__card">
      <h2
        id="astros-firmware-confirm-modal-title"
        class="astros-firmware-confirm-modal__title"
      >
        {{ t('firmware_view.confirm_modal.title') }}
      </h2>

      <dl class="astros-firmware-confirm-modal__list">
        <dt class="astros-firmware-confirm-modal__label">
          {{ t('firmware_view.confirm_modal.source_label') }}
        </dt>
        <dd class="astros-firmware-confirm-modal__source-value">{{ sourceDisplay() }}</dd>

        <dt class="astros-firmware-confirm-modal__label">
          {{ t('firmware_view.confirm_modal.controllers_label') }}
        </dt>
        <dd>
          <ul class="astros-firmware-confirm-modal__controllers">
            <li
              v-for="c in selectedControllers"
              :key="c.id"
              class="astros-firmware-confirm-modal__controller-row"
            >
              <span class="astros-firmware-confirm-modal__controller-name">{{ c.label }}</span>
              <AstrosFirmwareVersionDelta
                :current="c.current"
                :target="target"
              />
            </li>
          </ul>
        </dd>
      </dl>

      <p
        class="astros-firmware-confirm-modal__warning"
        role="note"
      >
        {{ t('firmware_view.confirm_modal.power_warning') }}
      </p>

      <!--
        Downgrade ack region: rendered only when at least one selected
        controller is running newer firmware than the target. The pure-
        upgrade modal stays unchanged (no extra friction). The checkbox
        is the last-chance confirmation — even with the panel's "Allow
        downgrades" toggle on, the operator must explicitly acknowledge
        the specific controllers about to receive older firmware.
        Confirm is disabled until ticked.
      -->
      <div
        v-if="requiresDowngradeAck"
        class="astros-firmware-confirm-modal__downgrade-ack"
        role="alert"
        data-test="downgrade-ack-region"
      >
        <label class="astros-firmware-confirm-modal__downgrade-ack-label">
          <input
            type="checkbox"
            class="astros-firmware-confirm-modal__downgrade-ack-checkbox"
            :checked="downgradeAck"
            data-test="downgrade-ack-checkbox"
            @change="downgradeAck = ($event.target as HTMLInputElement).checked"
          />
          <span>{{
            t('firmware_view.confirm_modal.downgrade_ack', {
              count: downgradeControllers.length,
            })
          }}</span>
        </label>
      </div>

      <div class="astros-firmware-confirm-modal__actions">
        <AstrosFirmwareButton
          kind="secondary"
          @click="emit('cancel')"
        >
          {{ t('firmware_view.confirm_modal.cancel') }}
        </AstrosFirmwareButton>
        <AstrosFirmwareButton
          kind="primary"
          :disabled="confirmDisabled"
          @click="emit('confirm')"
        >
          {{ t('firmware_view.confirm_modal.confirm') }}
        </AstrosFirmwareButton>
      </div>
    </div>
  </dialog>
</template>

<style scoped>
.astros-firmware-confirm-modal {
  border: none;
  padding: 0;
  background: transparent;
  font-family: 'Inter', system-ui, sans-serif;
}

.astros-firmware-confirm-modal::backdrop {
  background: rgba(14, 23, 38, 0.45);
}

.astros-firmware-confirm-modal__card {
  background: #ffffff;
  border: 1px solid #d6e0e6;
  border-radius: 6px;
  padding: 24px;
  width: min(480px, calc(100vw - 32px));
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 16px;
  box-shadow: 0 12px 32px rgba(14, 23, 38, 0.18);
}

.astros-firmware-confirm-modal__title {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  color: #0e1726;
}

.astros-firmware-confirm-modal__list {
  display: grid;
  grid-template-columns: 80px 1fr;
  row-gap: 8px;
  column-gap: 12px;
  margin: 0;
}

.astros-firmware-confirm-modal__label {
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #4b5b73;
  padding-top: 4px;
}

.astros-firmware-confirm-modal__source-value {
  margin: 0;
  font-family: ui-monospace, 'SF Mono', monospace;
  font-size: 13px;
  font-weight: 700;
  color: #0e1726;
  word-break: break-all;
}

.astros-firmware-confirm-modal__controllers {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.astros-firmware-confirm-modal__controller-row {
  display: flex;
  align-items: baseline;
  gap: 10px;
}

.astros-firmware-confirm-modal__controller-name {
  font-size: 13px;
  font-weight: 600;
  color: #0e1726;
  min-width: 50px;
}

.astros-firmware-confirm-modal__warning {
  margin: 0;
  font-size: 12px;
  color: #9a2828;
  background: #fbe0e0;
  border: 1px solid #cf424255;
  padding: 10px 12px;
  border-radius: 4px;
}

.astros-firmware-confirm-modal__actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.astros-firmware-confirm-modal__downgrade-ack {
  background: #fff2e2;
  border: 1px solid #cf424299;
  border-radius: 4px;
  padding: 10px 12px;
}

.astros-firmware-confirm-modal__downgrade-ack-label {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  font-size: 12px;
  color: #7a2222;
  cursor: pointer;
  user-select: none;
}

.astros-firmware-confirm-modal__downgrade-ack-checkbox {
  accent-color: #9a2828;
  margin-top: 2px;
  cursor: pointer;
}

.astros-firmware-confirm-modal__downgrade-ack-label:focus-within {
  outline: 2px solid #7d92b8;
  outline-offset: 2px;
}
</style>
