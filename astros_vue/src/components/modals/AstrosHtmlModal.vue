<script setup lang="ts">
withDefaults(
  defineProps<{
    content: string;
    title?: string;
  }>(),
  {
    title: '',
  },
);

const emit = defineEmits<{
  close: [];
}>();
</script>

<template>
  <dialog class="modal modal-open">
    <div class="modal-box">
      <h2
        v-if="title"
        class="text-2xl font-bold mb-4"
      >
        {{ title }}
      </h2>
      <div
        class="modal-body py-4"
        v-html="content"
      ></div>
      <div class="modal-action">
        <button
          data-testid="modal-close"
          class="btn"
          @click="emit('close')"
        >
          {{ $t('modals.confirm.close') }}
        </button>
      </div>
    </div>
    <form
      method="dialog"
      class="modal-backdrop"
      @click="emit('close')"
    >
      <button>{{ $t('modals.confirm.close') }}</button>
    </form>
  </dialog>
</template>
