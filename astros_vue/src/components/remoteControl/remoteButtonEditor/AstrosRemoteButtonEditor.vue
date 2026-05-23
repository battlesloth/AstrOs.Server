<script setup lang="ts">
import { computed, ref } from 'vue';
import type { PageButton } from '@/models/remoteControl/pageButton';
import type { EditorTab, EditorListItem } from './types';

const props = defineProps<{
  buttonNumber: number;
  currentValue: PageButton;
  scripts: EditorListItem[];
  playlists: EditorListItem[];
}>();

const emit = defineEmits<{
  change: [value: PageButton];
  close: [];
}>();

const initialTab: EditorTab = props.currentValue.type === 'playlist' ? 'playlist' : 'script';
const tab = ref<EditorTab>(initialTab);
const query = ref('');

const items = computed<EditorListItem[]>(() => {
  const source = tab.value === 'script' ? props.scripts : props.playlists;
  const q = query.value.trim().toLowerCase();
  if (q.length === 0) return source;
  return source.filter((i) => i.name.toLowerCase().includes(q));
});

function selectItem(item: EditorListItem) {
  emit('change', { id: item.id, name: item.name, type: tab.value });
}

function selectNone() {
  emit('change', { id: '0', name: 'None', type: 'none' });
}
</script>

<template>
  <div class="astros-remote-button-editor">
    <header>
      <span>BTN {{ buttonNumber }} · EDITING</span>
      <button
        type="button"
        data-testid="editor-close"
        @click="emit('close')"
      >
        ×
      </button>
    </header>
    <div role="tablist">
      <button
        type="button"
        role="tab"
        :aria-selected="tab === 'script'"
        data-testid="editor-tab-script"
        @click="tab = 'script'"
      >
        Scripts
      </button>
      <button
        type="button"
        role="tab"
        :aria-selected="tab === 'playlist'"
        data-testid="editor-tab-playlist"
        @click="tab = 'playlist'"
      >
        Playlists
      </button>
    </div>
    <input
      v-model="query"
      type="search"
      placeholder="Search…"
      data-testid="editor-search"
    />
    <ul>
      <li>
        <button
          type="button"
          data-testid="editor-none"
          @click="selectNone"
        >
          None
        </button>
      </li>
      <li
        v-for="item in items"
        :key="item.id"
      >
        <button
          type="button"
          :data-testid="`editor-item-${item.id}`"
          @click="selectItem(item)"
        >
          {{ item.name }}
        </button>
      </li>
      <li
        v-if="items.length === 0"
        data-testid="editor-empty"
      >
        No matches
      </li>
    </ul>
  </div>
</template>
