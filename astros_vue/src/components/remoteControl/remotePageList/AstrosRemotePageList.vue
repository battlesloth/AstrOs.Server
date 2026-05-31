<script setup lang="ts">
import { nextTick, ref, useId, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { VueDraggable } from 'vue-draggable-plus';
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
  reorder: [payload: { fromIdx: number; toIdx: number }];
}>();

// vue-draggable-plus needs a writable model it can splice during a pointer
// drag. The store is authoritative, so we keep a local copy synced from the
// `pages` prop and never let the library's mutation be the source of truth —
// on drop we reset it and emit `reorder`, then the new order flows back here.
// deep:true because the store reorders IN PLACE (splice keeps the same array
// reference), so a shallow watch would never see a keyboard/pointer move.
const localPages = ref<RemoteControlPage[]>([]);
watch(
  () => props.pages,
  (pages) => {
    localPages.value = [...pages];
  },
  { immediate: true, deep: true },
);

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

// --- Keyboard reorder (grab handle) --------------------------------------
// A 2-state machine keyed by page id (like rename): idle | grabbed. The
// grabbed page is tracked by id, not slot, so a multi-step move re-resolves
// the current index after each store-applied reorder. grabOriginIdx is the
// slot at grab time, used to undo on Escape.
const grabbedId = ref<string | null>(null);
const grabOriginIdx = ref(-1);
// aria-live announcement. Cleared then re-set on the next tick so identical
// consecutive messages (e.g. a boundary bump) are re-announced — screen
// readers ignore an aria-live update whose text didn't change. A side effect:
// arrow presses faster than a tick coalesce to the LAST message, which is the
// desired behavior (the final resting position is what the user needs).
const liveMessage = ref('');
// One shared visually-hidden instructions element; every handle points its
// aria-describedby at it.
const helpId = useId();

function announce(
  key: 'grabbed' | 'moved' | 'dropped' | 'cancelled',
  name: string,
  position: number,
) {
  liveMessage.value = '';
  void nextTick(() => {
    liveMessage.value = t(`remote_control_config.pageList.${key}`, {
      name,
      position,
      total: props.pages.length,
    });
  });
}

function onHandleGrabToggle(idx: number) {
  if (renamingId.value !== null) return; // no keyboard reorder mid-rename
  if (grabbedId.value === null) {
    const page = props.pages[idx];
    if (!page) return;
    grabbedId.value = page.id;
    grabOriginIdx.value = idx;
    announce('grabbed', page.name, idx + 1);
  } else {
    // Drop where it currently sits — resolve by id, not the pressed handle.
    const i = props.pages.findIndex((p) => p.id === grabbedId.value);
    if (i !== -1) announce('dropped', props.pages[i]!.name, i + 1);
    grabbedId.value = null;
    grabOriginIdx.value = -1;
  }
}

function onHandleMove(direction: 1 | -1) {
  if (renamingId.value !== null || grabbedId.value === null) return;
  const currentIdx = props.pages.findIndex((p) => p.id === grabbedId.value);
  if (currentIdx === -1) {
    // Grabbed page vanished from under us (parent removed it) — end the grab.
    grabbedId.value = null;
    grabOriginIdx.value = -1;
    return;
  }
  const targetIdx = currentIdx + direction;
  if (targetIdx < 0 || targetIdx >= props.pages.length) return; // at a boundary
  emit('reorder', { fromIdx: currentIdx, toIdx: targetIdx });
  announce('moved', props.pages[currentIdx]!.name, targetIdx + 1);
}

function onHandleCancel() {
  if (renamingId.value !== null || grabbedId.value === null) return;
  const currentIdx = props.pages.findIndex((p) => p.id === grabbedId.value);
  if (currentIdx !== -1) {
    const name = props.pages[currentIdx]!.name;
    if (currentIdx !== grabOriginIdx.value) {
      emit('reorder', { fromIdx: currentIdx, toIdx: grabOriginIdx.value });
    }
    announce('cancelled', name, grabOriginIdx.value + 1);
  }
  grabbedId.value = null;
  grabOriginIdx.value = -1;
}

function onDragEnd(evt: { oldIndex?: number; newIndex?: number }) {
  const { oldIndex, newIndex } = evt;
  // Undo SortableJS's in-place reorder of localPages and defer to the store:
  // the move is emitted, applied by the parent, and the authoritative order
  // flows back via the `pages` prop. Resetting first means a store that
  // REJECTS the move (guard fail) still leaves the list visually correct.
  localPages.value = [...props.pages];
  if (oldIndex === undefined || newIndex === undefined || oldIndex === newIndex) return;
  emit('reorder', { fromIdx: oldIndex, toIdx: newIndex });
}

function dotClass(type: PageButton['type']): string {
  switch (type) {
    case 'script':
      return 'bg-primary';
    case 'playlist':
      return 'bg-r2-complement';
    case 'none':
      return 'bg-base-300';
    default:
      return assertNever(type);
  }
}
</script>

<template>
  <div class="astros-remote-page-list flex h-full w-full flex-col">
    <header class="sticky top-0 z-10 flex items-center justify-between bg-primary px-3 py-2">
      <span class="text-[13px] font-bold uppercase tracking-[0.1em] text-white">
        {{ t('remote_control_config.pageList.header') }}
      </span>
      <button
        type="button"
        class="btn btn-ghost btn-sm btn-square text-xl leading-none text-white"
        :aria-label="t('remote_control_config.pageList.add')"
        :title="t('remote_control_config.pageList.add')"
        data-testid="page-list-add"
        @click="emit('add')"
      >
        +
      </button>
    </header>
    <VueDraggable
      v-model="localPages"
      tag="ul"
      role="listbox"
      class="flex-1 overflow-y-auto p-1"
      :aria-label="t('remote_control_config.pageList.header')"
      handle="[data-drag-handle]"
      :animation="150"
      :force-fallback="true"
      @end="onDragEnd"
    >
      <li
        v-for="(page, idx) in localPages"
        :key="page.id"
        role="option"
        :tabindex="
          idx === selectedIdx ||
          (selectedIdx < 0 || selectedIdx >= localPages.length ? idx === 0 : false)
            ? 0
            : -1
        "
        :aria-selected="idx === selectedIdx ? 'true' : 'false'"
        :class="[
          'flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5',
          idx === selectedIdx ? 'bg-r2-xlight' : 'hover:bg-base-200',
          grabbedId === page.id ? 'ring-2 ring-primary' : '',
        ]"
        data-testid="page-list-row"
        @click="emit('select', idx)"
        @keydown.enter.self.prevent="emit('select', idx)"
        @keydown.space.self.prevent="emit('select', idx)"
      >
        <button
          type="button"
          data-drag-handle
          data-testid="page-list-drag-handle"
          class="btn btn-ghost btn-sm btn-square flex-shrink-0 cursor-grab text-base-content/40"
          :class="{ 'pointer-events-none opacity-40': renamingId === page.id }"
          :disabled="renamingId === page.id"
          :aria-label="t('remote_control_config.pageList.grab', { name: page.name })"
          :aria-describedby="helpId"
          @click.stop
          @keydown.space.prevent.stop="onHandleGrabToggle(idx)"
          @keydown.enter.prevent.stop="onHandleGrabToggle(idx)"
          @keydown.up.prevent.stop="onHandleMove(-1)"
          @keydown.down.prevent.stop="onHandleMove(1)"
          @keydown.esc.prevent.stop="onHandleCancel()"
        >
          <v-icon
            name="md-draghandle"
            scale="0.9"
            aria-hidden="true"
          />
        </button>
        <div
          class="grid flex-shrink-0 grid-cols-3 gap-px"
          aria-hidden="true"
        >
          <span
            v-for="key in BUTTON_KEYS"
            :key="key"
            :class="['block h-2 w-2 rounded-sm', dotClass(page[key].type)]"
            :data-type="page[key].type"
            data-testid="page-list-dot"
          />
        </div>
        <input
          v-if="renamingId === page.id"
          :ref="captureRenameInput"
          v-model="renameDraft"
          type="text"
          class="input input-bordered input-sm min-w-0 flex-1 text-sm"
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
            'min-w-0 flex-1 truncate text-sm',
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
            class="btn btn-ghost btn-sm btn-square text-base-content/60"
            :aria-label="t('remote_control_config.pageList.rename')"
            :title="t('remote_control_config.pageList.rename')"
            data-testid="page-list-rename"
            @click.stop="startRename(page.id, page.name)"
          >
            <v-icon
              name="io-create"
              scale="0.9"
            />
          </button>
          <button
            type="button"
            class="btn btn-ghost btn-sm btn-square text-base-content/60"
            :aria-label="t('remote_control_config.pageList.duplicate')"
            :title="t('remote_control_config.pageList.duplicate')"
            data-testid="page-list-duplicate"
            @click.stop="emit('duplicate', idx)"
          >
            <v-icon
              name="io-copy"
              scale="0.9"
            />
          </button>
          <button
            type="button"
            class="btn btn-ghost btn-sm btn-square text-base-content/60"
            :aria-label="t('remote_control_config.pageList.delete')"
            :title="t('remote_control_config.pageList.delete')"
            :disabled="pages.length <= 1"
            data-testid="page-list-delete"
            @click.stop="emit('delete', idx)"
          >
            <v-icon
              name="io-trash-bin"
              scale="0.9"
            />
          </button>
        </div>
      </li>
    </VueDraggable>
    <!-- Visually-hidden keyboard-reorder instructions, referenced by every
         handle's aria-describedby. -->
    <span
      :id="helpId"
      class="sr-only"
    >
      {{ t('remote_control_config.pageList.grabInstructions') }}
    </span>
    <!-- Live region announcing grab / move / drop / cancel to screen readers.
         role="status" + aria-live="polite" matches every other live region in
         the app; reorder feedback isn't urgent enough to interrupt (assertive),
         and role="status" already implies polite. -->
    <div
      class="sr-only"
      role="status"
      aria-live="polite"
      aria-atomic="true"
      data-testid="page-list-live"
    >
      {{ liveMessage }}
    </div>
  </div>
</template>
