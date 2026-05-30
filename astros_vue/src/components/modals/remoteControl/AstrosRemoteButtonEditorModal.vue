<script setup lang="ts">
import AstrosRemoteButtonEditor from '@/components/remoteControl/remoteButtonEditor/AstrosRemoteButtonEditor.vue';
import type { PageButton } from '@/models/remoteControl/pageButton';
import type { EditorListItem } from '@/components/remoteControl/remoteButtonEditor/types';

// View-owned singleton modal wrapper around the button editor. The editor
// stays presentation-agnostic content; this shell supplies the app's standard
// <dialog class="modal modal-open"> chrome (matches components/modals/scripter/).
// `change` is forwarded verbatim from the editor (selecting an item is the
// immediate action — there's no separate Save); `close` fires from the
// backdrop click, the editor's × button, or Escape.
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
    <div class="modal-box">
      <AstrosRemoteButtonEditor
        :button-number="buttonNumber"
        :current-value="currentValue"
        :scripts="scripts"
        :playlists="playlists"
        @change="(value) => emit('change', value)"
        @close="emit('close')"
      />
    </div>
    <form
      method="dialog"
      class="modal-backdrop"
      @click="emit('close')"
    >
      <button>{{ $t('remote_control_config.editor.close') }}</button>
    </form>
  </dialog>
</template>
