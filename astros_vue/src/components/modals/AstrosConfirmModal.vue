<script setup lang="ts">
import AstrosWriteButton from '@/components/common/AstrosWriteButton.vue';

const props = withDefaults(
  defineProps<{
    message: string;
    onClose: () => void;
    onConfirm: () => void;
    title?: string;
    // Optional interpolation params for `message`. Without this, callers that
    // needed interpolation had to pre-resolve via t(key, params) and pass the
    // resolved string as message — but then the modal's $t(message) lookup
    // misses, vue-i18n logs `[intlify] Not found ...`, and console fills with
    // noise on every open. Providing messageParams lets the modal call
    // $t(message, messageParams) so message stays a real key.
    messageParams?: Record<string, unknown>;
  }>(),
  {
    title: 'modals.confirm.title',
    messageParams: undefined,
  },
);

const closeModal = () => {
  props.onClose();
};
</script>

<template>
  <dialog class="modal modal-open">
    <div class="modal-box">
      <h2 class="text-2xl font-bold mb-4">{{ $t(title) }}</h2>
      <div class="modal-body py-4">
        <div class="flex justify-center">
          <span class="text-lg text-center">{{
            messageParams ? $t(message, messageParams) : $t(message)
          }}</span>
        </div>
      </div>
      <div class="modal-action">
        <AstrosWriteButton
          data-testid="modal-confirm"
          class="btn btn-primary"
          @click="onConfirm"
        >
          {{ $t('modals.confirm.confirm') }}
        </AstrosWriteButton>
        <button
          data-testid="modal-close"
          class="btn"
          @click="closeModal"
        >
          {{ $t('modals.confirm.close') }}
        </button>
      </div>
    </div>
    <form
      method="dialog"
      class="modal-backdrop"
      @click="closeModal"
    >
      <button>{{ $t('modals.confirm.close') }}</button>
    </form>
  </dialog>
</template>
