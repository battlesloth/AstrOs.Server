<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import AstrosSearchSelect from '@/components/common/searchableSelect/AstrosSearchSelect.vue';
import type { SearchSelectOption } from '@/components/common/searchableSelect/AstrosSearchSelect.vue';
import type { PageButton, PageButtonType } from '@/models/remoteControl/pageButton';

const { t } = useI18n();

interface SelectionItem {
  id: string;
  name: string;
}

const props = defineProps<{
  buttonNumber: number;
  currentValue: PageButton;
  scripts: SelectionItem[];
  playlists: SelectionItem[];
}>();

const emit = defineEmits<{
  (e: 'changed', value: PageButton): void;
}>();

const activeTab = ref<'script' | 'playlist'>(
  props.currentValue.type === 'playlist' ? 'playlist' : 'script',
);

const selectedId = ref(props.currentValue.id);

const activeOptions = computed<SearchSelectOption[]>(() => {
  const items = activeTab.value === 'script' ? props.scripts : props.playlists;
  return [
    { id: '0', label: t('none') },
    ...items.map((item) => ({ id: item.id, label: item.name })),
  ];
});

watch(selectedId, (newId) => {
  if (newId === '0') {
    emit('changed', { id: '0', name: 'None', type: 'none' });
    return;
  }
  const items = activeTab.value === 'script' ? props.scripts : props.playlists;
  const item = items.find((i) => i.id === newId);
  if (!item) return;
  const type: PageButtonType = activeTab.value === 'script' ? 'script' : 'playlist';
  emit('changed', { id: item.id, name: item.name, type });
});

watch(
  () => props.currentValue,
  (val) => {
    selectedId.value = val.id;
    if (val.type === 'playlist') activeTab.value = 'playlist';
    else if (val.type === 'script') activeTab.value = 'script';
  },
);

function switchTab(tab: 'script' | 'playlist') {
  if (tab === activeTab.value) return;
  activeTab.value = tab;
  if (props.currentValue.type !== 'none' && props.currentValue.type !== tab) {
    selectedId.value = '0';
    emit('changed', { id: '0', name: 'None', type: 'none' });
  }
}
</script>

<template>
  <div class="bg-primary border-2 border-black rounded-xl p-4">
    <div class="text-white font-bold text-sm mb-2 text-center">
      {{ t('remote_view.button_label', { number: buttonNumber }) }}
    </div>
    <!-- Tab Toggle -->
    <div
      class="flex mb-3 gap-1"
      role="tablist"
    >
      <button
        role="tab"
        :aria-selected="activeTab === 'script'"
        class="btn btn-sm min-w-0 flex-1 truncate border-none"
        :class="activeTab === 'script' ? 'bg-r2-xlight text-black' : 'bg-r2-light text-white'"
        @click="switchTab('script')"
      >
        {{ t('remote_view.tab_scripts') }}
      </button>
      <button
        role="tab"
        :aria-selected="activeTab === 'playlist'"
        class="btn btn-sm min-w-0 flex-1 truncate border-none"
        :class="activeTab === 'playlist' ? 'bg-r2-xlight text-black' : 'bg-r2-light text-white'"
        @click="switchTab('playlist')"
      >
        {{ t('remote_view.tab_playlists') }}
      </button>
    </div>

    <!-- Searchable Select -->
    <AstrosSearchSelect
      v-model="selectedId"
      :options="activeOptions"
      :placeholder="t('remote_view.search_placeholder')"
      size="md"
    />
  </div>
</template>
