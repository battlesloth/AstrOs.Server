<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import type { RemoteControlPage } from '@/models/remoteControl/remoteControlPage';

const { t } = useI18n();

defineProps<{
  pages: readonly RemoteControlPage[];
  selectedIdx: number;
}>();

// Emits land in Task 2.
</script>

<template>
  <div class="astros-remote-page-list flex h-full w-full flex-col">
    <header
      class="sticky top-0 z-10 flex items-center justify-between border-b border-base-300 bg-base-200 px-3 py-2"
    >
      <span class="text-[11px] font-bold uppercase tracking-[0.1em] text-base-content/60">
        {{ t('remote_control_config.pageList.header') }}
      </span>
      <button
        type="button"
        class="btn btn-ghost btn-xs btn-square text-primary"
        :aria-label="t('remote_control_config.pageList.add')"
        :title="t('remote_control_config.pageList.add')"
        data-testid="page-list-add"
      >
        +
      </button>
    </header>
    <ul
      role="listbox"
      class="flex-1 overflow-y-auto p-1"
    >
      <li
        v-for="(page, idx) in pages"
        :key="page.id"
        role="option"
        :aria-selected="idx === selectedIdx ? 'true' : 'false'"
        :class="[
          'flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5',
          idx === selectedIdx
            ? 'border border-primary/30 bg-primary/10'
            : 'border border-transparent hover:bg-base-200',
        ]"
        data-testid="page-list-row"
      >
        <span
          :class="[
            'min-w-0 flex-1 truncate text-xs',
            idx === selectedIdx ? 'font-semibold' : 'font-medium',
          ]"
          :title="page.name"
          data-testid="page-list-name"
        >
          {{ page.name }}
        </span>
      </li>
    </ul>
  </div>
</template>
