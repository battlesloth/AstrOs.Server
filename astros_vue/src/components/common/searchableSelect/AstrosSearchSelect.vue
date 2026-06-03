<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue';

export interface SearchSelectOption {
  id: string;
  label: string;
}

const props = defineProps<{
  options: SearchSelectOption[];
  placeholder?: string;
  dataTestid?: string;
  size?: 'sm' | 'md';
}>();

const modelValue = defineModel<string>({ required: true });

const searchQuery = ref('');
const isOpen = ref(false);
const highlightedIndex = ref(-1);
const inputRef = ref<HTMLInputElement | null>(null);
const listRef = ref<HTMLUListElement | null>(null);

const selectedLabel = computed(() => {
  const option = props.options.find((o) => o.id === modelValue.value);
  return option?.label ?? '';
});

const filteredOptions = computed(() => {
  if (!searchQuery.value) return props.options;
  const query = searchQuery.value.toLowerCase();
  return props.options.filter((o) => o.label.toLowerCase().includes(query));
});

watch(filteredOptions, () => {
  highlightedIndex.value = -1;
});

function scrollToHighlighted() {
  nextTick(() => {
    const list = listRef.value;
    if (!list) return;
    const item = list.children[highlightedIndex.value] as HTMLElement | undefined;
    item?.scrollIntoView({ block: 'nearest' });
  });
}

function open() {
  isOpen.value = true;
  searchQuery.value = '';
  highlightedIndex.value = -1;
  requestAnimationFrame(() => inputRef.value?.focus());
}

function select(option: SearchSelectOption) {
  modelValue.value = option.id;
  isOpen.value = false;
  searchQuery.value = '';
  highlightedIndex.value = -1;
}

function handleKeydown(event: KeyboardEvent) {
  const count = filteredOptions.value.length;
  if (count === 0) return;

  switch (event.key) {
    case 'ArrowDown':
      event.preventDefault();
      highlightedIndex.value = (highlightedIndex.value + 1) % count;
      scrollToHighlighted();
      break;
    case 'ArrowUp':
      event.preventDefault();
      highlightedIndex.value = (highlightedIndex.value - 1 + count) % count;
      scrollToHighlighted();
      break;
    case 'Enter':
      event.preventDefault();
      if (highlightedIndex.value >= 0 && highlightedIndex.value < count) {
        select(filteredOptions.value[highlightedIndex.value]!);
      }
      break;
    case 'Escape':
      isOpen.value = false;
      searchQuery.value = '';
      highlightedIndex.value = -1;
      break;
  }
}

function handleBlur() {
  // Delay to allow click on option to register
  setTimeout(() => {
    isOpen.value = false;
    searchQuery.value = '';
    highlightedIndex.value = -1;
  }, 150);
}
</script>

<template>
  <div class="relative w-full">
    <button
      v-if="!isOpen"
      type="button"
      :data-testid="dataTestid ? `${dataTestid}-trigger` : undefined"
      :class="[
        'select select-bordered w-full text-left',
        size === 'md' ? 'select-md' : 'select-sm',
      ]"
      @click="open"
    >
      {{ selectedLabel || placeholder || '' }}
    </button>
    <div
      v-else
      class="w-full"
    >
      <input
        ref="inputRef"
        v-model="searchQuery"
        type="text"
        :data-testid="dataTestid ? `${dataTestid}-search` : undefined"
        :placeholder="$t('placeholder.filter')"
        :class="['input input-bordered w-full', size === 'md' ? 'input-md' : 'input-sm']"
        @keydown="handleKeydown"
        @blur="handleBlur"
      />
      <ul
        ref="listRef"
        class="bg-base-200 rounded-box absolute z-10 mt-1 max-h-48 w-full overflow-y-auto shadow-lg flex flex-col p-2"
      >
        <li
          v-for="(option, index) in filteredOptions"
          :key="option.id"
        >
          <a
            :data-testid="dataTestid ? `${dataTestid}-option-${option.id}` : undefined"
            :class="[
              `block w-full px-3 rounded cursor-pointer hover:bg-base-300 ${size === 'md' ? 'py-2 text-base' : 'py-1 text-sm'}`,
              {
                'bg-base-300 font-semibold': option.id === modelValue && index !== highlightedIndex,
                'bg-primary text-primary-content': index === highlightedIndex,
              },
            ]"
            @mousedown.prevent="select(option)"
            @mouseenter="highlightedIndex = index"
          >
            {{ option.label }}
          </a>
        </li>
        <li v-if="filteredOptions.length === 0">
          <span class="disabled">{{ $t('placeholder.filter') }}</span>
        </li>
      </ul>
    </div>
  </div>
</template>
