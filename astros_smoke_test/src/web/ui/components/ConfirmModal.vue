<script setup lang="ts">
defineProps<{
  open: boolean;
  scenarioId: string;
  description: string;
}>();

const emit = defineEmits<{
  (e: 'confirm'): void;
  (e: 'cancel'): void;
}>();
</script>

<template>
  <div
    v-if="open"
    class="backdrop"
    @click.self="emit('cancel')"
  >
    <div
      class="modal"
      role="dialog"
      :aria-label="`Confirm destructive scenario ${scenarioId}`"
    >
      <h3>Destructive scenario</h3>
      <p class="id">{{ scenarioId }}</p>
      <p class="desc">{{ description }}</p>
      <p class="warning">
        This will wipe SD or drive hardware motion. Make sure the bench is in a safe state.
      </p>
      <div class="actions">
        <button
          class="cancel"
          @click="emit('cancel')"
        >
          Cancel
        </button>
        <button
          class="confirm"
          @click="emit('confirm')"
        >
          Confirm and run
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
  .backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
  }
  .modal {
    background: #161b22;
    border: 1px solid #f85149;
    border-radius: 8px;
    padding: 1.25rem 1.5rem;
    max-width: 28rem;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
  }
  h3 {
    margin: 0 0 0.5rem;
    color: #f85149;
  }
  .id {
    margin: 0 0 0.25rem;
    color: #f0883e;
    font-weight: 600;
  }
  .desc {
    margin: 0 0 0.75rem;
    color: #c9d1d9;
    font-size: 0.9rem;
  }
  .warning {
    margin: 0 0 1rem;
    color: #ffa198;
    font-size: 0.85rem;
    background: #4a1c1c;
    padding: 0.5rem 0.75rem;
    border-radius: 4px;
  }
  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
  }
  button {
    font: inherit;
    padding: 0.5rem 1rem;
    border-radius: 4px;
    border: 1px solid #30363d;
    cursor: pointer;
  }
  .cancel {
    background: #21262d;
    color: #c9d1d9;
  }
  .cancel:hover {
    border-color: #58a6ff;
  }
  .confirm {
    background: #f85149;
    color: #fff;
    border-color: #f85149;
    font-weight: 600;
  }
  .confirm:hover {
    background: #da3633;
  }
</style>
