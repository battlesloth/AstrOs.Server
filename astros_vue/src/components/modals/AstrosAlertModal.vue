<script setup lang="ts">

const props = withDefaults(defineProps<{
  message: string;
  title?: string;
}>(), {
  title: "modals.alert.title",
});



const emit = defineEmits({
  close: null,
});

const closeModal = () => {
  emit('close');
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
        <button data-testid="modal-close" class="btn" @click="closeModal">{{ $t("modals.alert.close") }}</button>
      </div>
    </div>
    <form method="dialog" class="modal-backdrop" @click="closeModal">
      <button>{{ $t("modals.alert.close") }}</button>
    </form>
  </dialog>
</template>
