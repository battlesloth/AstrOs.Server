<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    message: string;
    onClose: () => void;
    onConfirm: () => void;
    title?: string;
  }>(),
  {
    title: 'modals.confirm.title',
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
          <span class="text-lg text-center">{{ $t(message) }}</span>
        </div>
      </div>
      <div class="modal-action">
        <button
          data-testid="modal-confirm"
          class="btn btn-primary"
          @click="onConfirm"
        >
          {{ $t('modals.confirm.confirm') }}
        </button>
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
