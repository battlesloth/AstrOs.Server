<script setup lang="ts">

const props = defineProps<{
  message: string;
}>();

const emit = defineEmits(
  {
    close: null,
  }
);

const closeModal = () => {
  emit('close');
};
</script>

<template>
  <dialog class="modal modal-open">
    <div class="modal-box">
      <h2 class="text-2xl font-bold mb-4">Alert</h2>
      <div class="modal-body py-4">
        <div class="flex justify-center">
          <span class="text-lg text-center">{{ message }}</span>
        </div>
      </div>
      <div class="modal-action">
        <button data-testid="modal-close" class="btn" @click="closeModal">Close</button>
      </div>
    </div>
    <form method="dialog" class="modal-backdrop" @click="closeModal">
      <button>close</button>
    </form>
  </dialog>
</template>
