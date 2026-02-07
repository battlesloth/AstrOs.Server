<script setup lang="ts">
defineProps<{
  message: string;
}>();
</script>

<template>
  <dialog
    data-testid="loading-modal"
    class="modal modal-open"
  >
    <div class="modal-box">
      <div class="py-8">
        <div class="flex flex-col items-center gap-4">
          <span class="loading loading-spinner loading-lg"></span>
          <div class="text-center">{{ $t(message) }}</div>
        </div>
      </div>
    </div>
  </dialog>
</template>
