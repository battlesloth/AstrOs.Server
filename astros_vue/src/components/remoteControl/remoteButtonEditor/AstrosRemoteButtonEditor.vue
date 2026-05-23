<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import type { PageButton } from '@/models/remoteControl/pageButton';
import type { EditorTab, EditorListItem } from './types';

const { t } = useI18n();

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
  <div
    class="astros-remote-button-editor flex flex-col gap-2"
    tabindex="-1"
    @keydown.escape="emit('close')"
  >
    <header class="flex items-center justify-between">
      <span class="text-[10px] font-bold uppercase tracking-[0.1em] text-base-content/60">
        {{ t('remote_control_config.editor.header', { n: buttonNumber }) }}
      </span>
      <button
        type="button"
        class="btn btn-ghost btn-xs btn-square"
        :aria-label="t('remote_control_config.editor.close')"
        data-testid="editor-close"
        @click="emit('close')"
      >
        ×
      </button>
    </header>

    <div
      role="tablist"
      class="flex gap-1"
    >
      <button
        type="button"
        role="tab"
        class="flex-1 rounded-md py-1 text-xs font-semibold capitalize"
        :class="
          tab === 'script'
            ? 'bg-primary/10 text-primary'
            : 'bg-transparent text-base-content/60 hover:bg-base-200'
        "
        :aria-selected="tab === 'script'"
        data-testid="editor-tab-script"
        @click="tab = 'script'"
      >
        {{ t('remote_control_config.editor.tab_script') }}
      </button>
      <button
        type="button"
        role="tab"
        class="flex-1 rounded-md py-1 text-xs font-semibold capitalize"
        :class="
          tab === 'playlist'
            ? 'bg-primary/10 text-primary'
            : 'bg-transparent text-base-content/60 hover:bg-base-200'
        "
        :aria-selected="tab === 'playlist'"
        data-testid="editor-tab-playlist"
        @click="tab = 'playlist'"
      >
        {{ t('remote_control_config.editor.tab_playlist') }}
      </button>
    </div>

    <input
      v-model="query"
      type="search"
      class="input input-sm input-bordered w-full text-xs"
      :placeholder="t('remote_control_config.editor.search_placeholder')"
      data-testid="editor-search"
    />

    <ul
      class="flex max-h-56 min-h-24 flex-col gap-px overflow-y-auto rounded-md border border-base-300 p-1 text-xs"
    >
      <li>
        <button
          type="button"
          class="flex w-full items-center rounded px-2 py-1 text-left italic text-base-content/60 hover:bg-base-200"
          data-testid="editor-none"
          @click="selectNone"
        >
          {{ t('remote_control_config.editor.none_row') }}
        </button>
      </li>
      <li
        v-for="item in items"
        :key="item.id"
      >
        <button
          type="button"
          class="flex w-full items-center rounded px-2 py-1 text-left hover:bg-base-200"
          :data-testid="`editor-item-${item.id}`"
          @click="selectItem(item)"
        >
          {{ item.name }}
        </button>
      </li>
      <li
        v-if="items.length === 0"
        class="px-2 py-3 text-center text-[11px] text-base-content/50"
        data-testid="editor-empty"
      >
        {{ t('remote_control_config.editor.empty_state') }}
      </li>
    </ul>
  </div>
</template>
