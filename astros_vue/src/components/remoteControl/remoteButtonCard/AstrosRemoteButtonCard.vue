<script setup lang="ts">
import { computed } from 'vue';
import type { PageButton } from '@/models/remoteControl/pageButton';
import type { EditorListItem } from '../remoteButtonEditor/types';

const props = defineProps<{
  buttonNumber: number;
  value: PageButton;
  scripts: EditorListItem[];
  playlists: EditorListItem[];
}>();

const emit = defineEmits<{
  change: [value: PageButton];
}>();

const isAssigned = computed(() => props.value.type !== 'none');

const typeChipClasses = computed(() =>
  props.value.type === 'playlist'
    ? 'bg-warning/15 text-warning-content border border-warning/40'
    : 'bg-primary/15 text-primary border border-primary/40',
);

function clearAssignment() {
  emit('change', { id: '0', name: 'None', type: 'none' });
}

// Suppress unused-prop warnings for scripts/playlists — they're forwarded
// to the editor popover in the next task. Reading them here keeps Vue's
// reactivity from warning about unused destructure.
void props.scripts;
void props.playlists;
</script>

<template>
  <div
    class="astros-remote-button-card flex min-h-32 flex-col gap-2 rounded-xl border-2 p-3 transition-colors"
    :class="
      isAssigned
        ? 'border-primary bg-primary/5'
        : 'border-base-300 bg-base-100 hover:border-base-content/30'
    "
  >
    <div class="flex items-center justify-between">
      <span class="text-[10px] font-bold uppercase tracking-[0.1em] text-base-content/60">
        BUTTON {{ buttonNumber }}
      </span>
      <span
        v-if="isAssigned"
        :class="[
          'rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider',
          typeChipClasses,
        ]"
        data-testid="card-type-chip"
      >
        {{ value.type }}
      </span>
    </div>

    <template v-if="isAssigned">
      <div class="flex-1 text-center text-sm font-semibold leading-tight">{{ value.name }}</div>
      <div class="flex gap-2">
        <button
          type="button"
          class="btn btn-sm btn-outline flex-1"
          data-testid="card-edit"
        >
          Edit
        </button>
        <button
          type="button"
          class="btn btn-sm btn-ghost flex-1"
          data-testid="card-clear"
          @click="clearAssignment"
        >
          Clear
        </button>
      </div>
    </template>
    <template v-else>
      <button
        type="button"
        class="btn btn-sm btn-ghost mt-auto w-full justify-center text-base-content/60"
        data-testid="card-configure"
      >
        Configure →
      </button>
    </template>
  </div>
</template>
