<script setup lang="ts">
import { nextTick, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { BUTTON_KEYS, type RemoteControlPage } from '@/models/remoteControl/remoteControlPage';
import type { PageButton } from '@/models/remoteControl/pageButton';
import { assertNever } from '@/utils/assertNever';

const { t } = useI18n();

defineProps<{
  pages: readonly RemoteControlPage[];
  selectedIdx: number;
}>();

const emit = defineEmits<{
  select: [idx: number];
  add: [];
  duplicate: [idx: number];
  delete: [idx: number];
  rename: [payload: { idx: number; name: string }];
}>();

const renamingIdx = ref<number | null>(null);
// renameDraft only carries meaning when renamingIdx !== null; the two refs
// form a 2-state machine (idle | renaming).
const renameDraft = ref('');
// Captured via function ref on the rename input. Only one input is ever
// mounted at a time (v-if=renamingIdx===idx), so this callback fires once
// with the element on mount and once with null on unmount. Scoped to this
// component instance — unlike document.querySelector which would clash if
// two AstrosRemotePageLists were ever mounted on the same view.
let renameInputEl: HTMLInputElement | null = null;
function captureRenameInput(el: unknown) {
  // Vue's function-ref signature is broader than Element (also accepts a
  // ComponentPublicInstance for child components). We only attach this ref
  // to an <input>, so the runtime value is always HTMLInputElement | null.
  renameInputEl = el as HTMLInputElement | null;
}

function startRename(idx: number, current: string) {
  renamingIdx.value = idx;
  renameDraft.value = current;
  nextTick(() => renameInputEl?.focus());
}

function commitRename(forIdx: number) {
  // `forIdx` is the row this commit was bound to at handler-attach time. If
  // the user has already switched rename to a different row (e.g., clicked
  // another row's pencil), this blur/Enter is stale — the focus moved on
  // and the active draft now belongs to a different row. Drop it.
  if (renamingIdx.value !== forIdx) return;
  const trimmed = renameDraft.value.trim();
  // Exit rename mode FIRST so the blur handler that fires as a side-effect
  // of Enter (which removes the input from the DOM) doesn't re-enter this
  // function and double-emit.
  renamingIdx.value = null;
  if (trimmed.length === 0) return;
  emit('rename', { idx: forIdx, name: trimmed });
}

function cancelRename() {
  renamingIdx.value = null;
}

function dotClass(type: PageButton['type']): string {
  switch (type) {
    case 'script':
      return 'bg-primary';
    case 'playlist':
      return 'bg-orange-500';
    case 'none':
      return 'bg-base-300';
    default:
      return assertNever(type);
  }
}
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
        @click="emit('add')"
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
        @click="emit('select', idx)"
      >
        <div
          class="grid flex-shrink-0 grid-cols-3 gap-px"
          aria-hidden="true"
        >
          <span
            v-for="key in BUTTON_KEYS"
            :key="key"
            :class="['block h-1.5 w-1.5 rounded-sm', dotClass(page[key].type)]"
            :data-type="page[key].type"
            data-testid="page-list-dot"
          />
        </div>
        <input
          v-if="renamingIdx === idx"
          :ref="captureRenameInput"
          v-model="renameDraft"
          type="text"
          class="input input-bordered input-xs min-w-0 flex-1 text-xs"
          :aria-label="t('remote_control_config.pageList.renameInput')"
          data-testid="page-list-rename-input"
          @click.stop
          @keydown.enter.prevent="commitRename(idx)"
          @keydown.escape="cancelRename"
          @blur="commitRename(idx)"
        />
        <span
          v-else
          :class="[
            'min-w-0 flex-1 truncate text-xs',
            idx === selectedIdx ? 'font-semibold' : 'font-medium',
          ]"
          :title="page.name"
          data-testid="page-list-name"
        >
          {{ page.name }}
        </span>
        <div class="flex flex-shrink-0 items-center gap-px">
          <button
            type="button"
            class="btn btn-ghost btn-xs btn-square text-base-content/60"
            :aria-label="t('remote_control_config.pageList.rename')"
            :title="t('remote_control_config.pageList.rename')"
            data-testid="page-list-rename"
            @click.stop="startRename(idx, page.name)"
          >
            <v-icon
              name="md-edit"
              scale="0.7"
            />
          </button>
          <button
            type="button"
            class="btn btn-ghost btn-xs btn-square text-base-content/60"
            :aria-label="t('remote_control_config.pageList.duplicate')"
            :title="t('remote_control_config.pageList.duplicate')"
            data-testid="page-list-duplicate"
            @click.stop="emit('duplicate', idx)"
          >
            <v-icon
              name="md-contentcopy"
              scale="0.7"
            />
          </button>
          <button
            type="button"
            class="btn btn-ghost btn-xs btn-square text-base-content/60"
            :aria-label="t('remote_control_config.pageList.delete')"
            :title="t('remote_control_config.pageList.delete')"
            :disabled="pages.length <= 1"
            data-testid="page-list-delete"
            @click.stop="emit('delete', idx)"
          >
            <v-icon
              name="md-delete"
              scale="0.7"
            />
          </button>
        </div>
      </li>
    </ul>
  </div>
</template>
