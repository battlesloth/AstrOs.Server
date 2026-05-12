<script setup lang="ts">
import { ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import AstrosFirmwareButton from '../firmwareButton/AstrosFirmwareButton.vue';
import AstrosFirmwareVersionDelta from '../firmwareVersionDelta/AstrosFirmwareVersionDelta.vue';
import type { FirmwareControllerView } from '@/types/firmware';

const props = defineProps<{
  open: boolean;
  target: string | null;
  selectedControllers: FirmwareControllerView[];
  uploadedFilename?: string | null;
  sourceMode: 'github' | 'upload';
}>();

const emit = defineEmits<{ cancel: []; confirm: [] }>();

const { t } = useI18n();

const dialogRef = ref<HTMLDialogElement | null>(null);

// Native <dialog>.showModal() handles focus trap, ESC dismissal, and focus
// restore for free. Sync .open prop to the imperative API.
watch(
  () => props.open,
  (open) => {
    const el = dialogRef.value;
    if (!el) return;
    if (open && !el.open) el.showModal();
    else if (!open && el.open) el.close();
  },
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

      <div class="astros-firmware-confirm-modal__actions">
        <AstrosFirmwareButton
          kind="secondary"
          @click="emit('cancel')"
        >
          {{ t('firmware_view.confirm_modal.cancel') }}
        </AstrosFirmwareButton>
        <AstrosFirmwareButton
          kind="primary"
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
</style>
