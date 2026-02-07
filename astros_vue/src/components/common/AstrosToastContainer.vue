<script setup lang="ts">
import { useToast } from '@/composables/useToast';

const { toasts, removeToast } = useToast();

const getAlertClass = (type: string) => {
  switch (type) {
    case 'success':
      return 'alert-success';
    case 'error':
      return 'alert-error';
    case 'warning':
      return 'alert-warning';
    case 'info':
    default:
      return 'alert-info';
  }
};
</script>

<template>
  <div class="toast toast-center z-50">
    <div
      v-for="toast in toasts"
      :key="toast.id"
      class="alert"
      :class="getAlertClass(toast.type)"
    >
      <span>{{ toast.message }}</span>
      <button
        class="btn btn-sm btn-circle btn-ghost"
        @click="removeToast(toast.id)"
      >
        ✕
      </button>
    </div>
  </div>
</template>
