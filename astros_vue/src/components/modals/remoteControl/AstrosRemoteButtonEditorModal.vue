<script setup lang="ts">
import AstrosRemoteButtonEditor from '@/components/remoteControl/remoteButtonEditor/AstrosRemoteButtonEditor.vue';
import type { PageButton } from '@/models/remoteControl/pageButton';
import type { EditorListItem } from '@/components/remoteControl/remoteButtonEditor/types';

// View-owned singleton modal wrapper around the button editor. Supplies the
// app's standard modal chrome — title + modal-action footer Close button,
// matching components/modals/scripter/ — around the editor content. `change`
// is forwarded verbatim from the editor (selecting an item is the immediate
// action — there's no separate Save); `close` fires from the footer button,
// the backdrop click, or the editor's Escape handler.
defineProps<{
  buttonNumber: number;
  currentValue: PageButton;
  scripts: readonly EditorListItem[];
  playlists: readonly EditorListItem[];
}>();

const emit = defineEmits<{
  change: [value: PageButton];
  close: [];
}>();
</script>

<template>
  <dialog class="modal modal-open">
    <div class="modal-box w-100 max-w-md">
      <h1 class="text-2xl font-bold mb-4">
        {{ $t('remote_control_config.editor.title', { n: buttonNumber }) }}
      </h1>

      <AstrosRemoteButtonEditor
        :current-value="currentValue"
        :scripts="scripts"
        :playlists="playlists"
        @change="(value) => emit('change', value)"
        @close="emit('close')"
      />

      <div class="modal-action justify-center mt-5">
        <button
          type="button"
          class="btn w-24 text-lg"
          data-testid="editor-modal-close"
          @click="emit('close')"
        >
          {{ $t('close') }}
        </button>
      </div>
    </div>
    <form
      method="dialog"
      class="modal-backdrop"
      @click="emit('close')"
    >
      <button>{{ $t('close') }}</button>
    </form>
  </dialog>
</template>
