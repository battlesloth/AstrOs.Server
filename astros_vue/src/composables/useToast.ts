import { ref } from 'vue';

export interface Toast {
  id: number;
  message: string;
  type: 'success' | 'error' | 'info' | 'warning';
}

const toasts = ref<Toast[]>([]);
let toastId = 0;

export function useToast() {
  const addToast = (message: string, type: Toast['type'] = 'info', duration = 3000) => {
    const id = toastId++;
    toasts.value.push({ id, message, type });

    setTimeout(() => {
      removeToast(id);
    }, duration);
  };

  const removeToast = (id: number) => {
    const index = toasts.value.findIndex((t) => t.id === id);
    if (index > -1) {
      toasts.value.splice(index, 1);
    }
  };

  const success = (message: string, duration = 3000) => {
    addToast(message, 'success', duration);
  };

  const error = (message: string, duration = 3000) => {
    addToast(message, 'error', duration);
  };

  const info = (message: string, duration = 3000) => {
    addToast(message, 'info', duration);
  };

  const warning = (message: string, duration = 3000) => {
    addToast(message, 'warning', duration);
  };

  return {
    toasts,
    addToast,
    removeToast,
    success,
    error,
    info,
    warning,
  };
}
