<script setup lang="ts">
import { nextTick, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { BUTTON_KEYS, type RemoteControlPage } from '@/models/remoteControl/remoteControlPage';
import type { PageButton } from '@/models/remoteControl/pageButton';
import { assertNever } from '@/utils/assertNever';

const { t } = useI18n();

const props = defineProps<{
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

// Rename state is keyed by page.id (stable across reorder/insert/delete),
// not by position. The forIdx-style guard fixed cross-row pencil hand-off
// in one tick, but parent-driven mutation of `pages` (Phase 5 reorder, an
// async insert, a realtime sync) re-renders v-for with shifted indices —
// an idx-based binding would re-attach the rename input to whatever page
// now sits at the stale index. The emit shape stays {idx, name} per spec;
// the idx is resolved at commit time from the captured page id.
const renamingId = ref<string | null>(null);
// renameDraft only carries meaning when renamingId !== null; the two refs
// form a 2-state machine (idle | renaming).
const renameDraft = ref('');
// Captured via function ref on the rename input. Only one input is ever
// mounted at a time (v-if=renamingId===page.id), so this callback fires
// once with the element on mount and once with null on unmount. Scoped to
// this component instance.
let renameInputEl: HTMLInputElement | null = null;
function captureRenameInput(el: unknown) {
  // Vue's function-ref signature accepts Element | ComponentPublicInstance |
  // null. We only attach this ref to an <input>, but a future refactor that
  // moved the ref onto a child component would silently produce a non-Element.
  // instanceof narrows correctly and degrades to null on misuse, so .focus()
  // becomes a visible no-op rather than a thrown TypeError.
  renameInputEl = el instanceof HTMLInputElement ? el : null;
}

function startRename(id: string, current: string) {
  renamingId.value = id;
  renameDraft.value = current;
  nextTick(() => {
    // Skip focus if the element was detached between capture and tick
    // (e.g., the parent unmounted the component or removed the page).
    if (renameInputEl?.isConnected) renameInputEl.focus();
  });
}

function commitRename(forId: string) {
  // `forId` is the page id this commit was bound to at handler-attach time.
  // If the user has already switched rename to a different row (e.g.,
  // clicked another row's pencil), this blur/Enter is stale — drop it.
  if (renamingId.value !== forId) return;
  const trimmed = renameDraft.value.trim();
  // Exit rename mode FIRST so the blur handler that fires as a side-effect
  // of Enter (which removes the input from the DOM) doesn't re-enter this
  // function and double-emit.
  renamingId.value = null;
  if (trimmed.length === 0) return;
  // Resolve idx at commit time so the emit reflects the page's CURRENT
  // position, not its position when rename started. Survives reorder.
  const idx = props.pages.findIndex((p) => p.id === forId);
  if (idx === -1) return; // page was removed mid-rename; no emit for a gone page
  emit('rename', { idx, name: trimmed });
}

function cancelRename() {
  renamingId.value = null;
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
      :aria-label="t('remote_control_config.pageList.header')"
    >
      <li
        v-for="(page, idx) in pages"
        :key="page.id"
        role="option"
        :tabindex="
          idx === selectedIdx ||
          (selectedIdx < 0 || selectedIdx >= pages.length ? idx === 0 : false)
            ? 0
            : -1
        "
        :aria-selected="idx === selectedIdx ? 'true' : 'false'"
        :class="[
          'flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5',
          idx === selectedIdx
            ? 'border border-primary/30 bg-primary/10'
            : 'border border-transparent hover:bg-base-200',
        ]"
        data-testid="page-list-row"
        @click="emit('select', idx)"
        @keydown.enter.self.prevent="emit('select', idx)"
        @keydown.space.self.prevent="emit('select', idx)"
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
          v-if="renamingId === page.id"
          :ref="captureRenameInput"
          v-model="renameDraft"
          type="text"
          class="input input-bordered input-xs min-w-0 flex-1 text-xs"
          :aria-label="t('remote_control_config.pageList.renameInput')"
          data-testid="page-list-rename-input"
          @click.stop
          @keydown.enter.prevent="commitRename(page.id)"
          @keydown.escape="cancelRename"
          @blur="commitRename(page.id)"
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
            @click.stop="startRename(page.id, page.name)"
          >
            <v-icon
              name="io-create"
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
              name="io-copy"
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
              name="io-trash-bin"
              scale="0.7"
            />
          </button>
        </div>
      </li>
    </ul>
  </div>
</template>
