<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { storeToRefs } from 'pinia';
import { AstrosLayout } from '@/components';
import AstrosRemoteButtonCard from '@/components/remoteControl/remoteButtonCard/AstrosRemoteButtonCard.vue';
import AstrosRemotePageList from '@/components/remoteControl/remotePageList/AstrosRemotePageList.vue';
import AstrosRemoteLivePreview from '@/components/remoteControl/remoteLivePreview/AstrosRemoteLivePreview.vue';
import AstrosWriteButton from '@/components/common/AstrosWriteButton.vue';
import AstrosConfirmModal from '@/components/modals/AstrosConfirmModal.vue';
import AstrosRemoteButtonEditorModal from '@/components/modals/remoteControl/AstrosRemoteButtonEditorModal.vue';
import { useRemoteControlStore } from '@/stores/remoteControl';
import { useScriptsStore } from '@/stores/scripts';
import { usePlaylistsStore } from '@/stores/playlists';
import { useToast } from '@/composables/useToast';
import { BUTTON_KEYS, type ButtonKey } from '@/models/remoteControl/remoteControlPage';
import type { PageButton } from '@/models/remoteControl/pageButton';
import type { EditorListItem } from '@/components/remoteControl/remoteButtonEditor/types';

const { t } = useI18n();

const remoteControlStore = useRemoteControlStore();
const scriptStore = useScriptsStore();
const playlistStore = usePlaylistsStore();
const { success, error } = useToast();

const { remoteControlPages, selectedIdx, isDirty, isSaving } = storeToRefs(remoteControlStore);

// Three mount states gate the template:
//   isInitialLoading=true   → loading panel (initial; until Promise.all resolves)
//   loadFailed=true         → error banner (any of three loads failed)
//   neither                 → 3-pane editor
// Both flags start in their "block editing" position so a user can never
// interact with empty/stale Pinia state during the initial-load window —
// e.g., clicking Add against a still-empty pages array, only to have the
// successful load later REPLACE the array (silently dropping the interim
// add) or the failed load surface a banner that hides the lost mutation.
const isInitialLoading = ref(true);
const loadFailed = ref(false);
const scripts = ref<EditorListItem[]>([]);
const playlists = ref<EditorListItem[]>([]);

onMounted(async () => {
  try {
    const [scriptsResult, playlistsResult, remoteResult] = await Promise.all([
      scriptStore.loadScripts(),
      playlistStore.loadData(),
      remoteControlStore.loadRemoteControl(),
    ]);

    // ANY of the three loads failing disables editing — partial state would
    // let the user save a config that references scripts/playlists they
    // couldn't see in the editor dropdowns.
    if (!scriptsResult.success || !playlistsResult.success || !remoteResult.success) {
      loadFailed.value = true;
      error(t('remote_control_config.view.load_error'));
      return;
    }

    scripts.value = scriptStore.scripts.map((s) => ({ id: s.id, name: s.scriptName }));
    playlists.value = playlistStore.playlists.map((p) => ({ id: p.id, name: p.playlistName }));
  } finally {
    // Regardless of success or failure, the load window is closed — clear
    // the initial-loading state so the template moves to either the editor
    // or the error banner.
    isInitialLoading.value = false;
  }
});

async function saveConfig() {
  // The store catches its own errors and resolves with {success: false, error}
  // rather than rejecting — a bare `await` here would never throw and every
  // failed PUT would render as a success toast. Inspect the flag.
  const result = await remoteControlStore.saveRemoteControl();
  if (result.success) {
    success(t('remote_control_config.view.save_success'));
  } else {
    error(t('remote_control_config.view.save_error'));
  }
}

function onSelectPage(idx: number) {
  remoteControlStore.selectPage(idx);
}

function onAddPage() {
  remoteControlStore.addPage();
}

function onDuplicatePage(idx: number) {
  remoteControlStore.duplicatePage(idx);
}

function onRenamePage(payload: { idx: number; name: string }) {
  remoteControlStore.renamePage(payload.idx, payload.name);
}

// Delete-confirm modal state. The page list emits delete(idx); we capture
// idx here, open the modal, and wait for user confirmation before calling
// store.deletePage. Cancel resets pendingDeleteIdx without mutation.
// Captures both idx and name atomically — if a future websocket-driven sync
// renames or removes the page between modal-open and confirm, the dialog
// still shows the name the user clicked to delete.
const pendingDelete = ref<{ idx: number; name: string } | null>(null);

function onDeleteRequest(idx: number) {
  const name = remoteControlPages.value[idx]?.name;
  if (name === undefined) {
    // Reaching here means the page list emitted delete with an idx outside
    // [0, pages.length) — only possible if its v-for iterates a stale array.
    // Surface in DevTools instead of silently dropping the click, matching
    // the store-invariant warning style at remoteControl.ts:124+.
    console.warn(
      `[RemoteControlConfigView] onDeleteRequest: idx ${idx} out of range (pages: ${remoteControlPages.value.length})`,
    );
    return;
  }
  pendingDelete.value = { idx, name };
}

function onDeleteConfirm() {
  if (pendingDelete.value === null) return;
  remoteControlStore.deletePage(pendingDelete.value.idx);
  pendingDelete.value = null;
}

function onDeleteCancel() {
  pendingDelete.value = null;
}

function onButtonChange(key: ButtonKey, value: PageButton) {
  // setButton atomically writes the slot AND flips isDirty, so no view-level
  // dirty-tracking is needed.
  remoteControlStore.setButton(selectedIdx.value, key, value);
}

const currentPage = computed(() => {
  const page = remoteControlPages.value[selectedIdx.value];
  if (page === undefined && remoteControlPages.value.length > 0) {
    // Reaching this branch with non-empty pages means selectedIdx fell out of
    // range without the store's selectPage/deletePage clamping catching it —
    // a store-invariant violation. Surface in DevTools so a real bug doesn't
    // hide behind the silent v-if="currentPage" template gate.
    console.warn(
      `[RemoteControlConfigView] currentPage: selectedIdx ${selectedIdx.value} out of range (pages: ${remoteControlPages.value.length})`,
    );
  }
  return page ?? null;
});

// Editor modal state — view-owned singleton (matches ScripterView's modal
// pattern). A card's edit request sets editingButtonKey; the modal renders only
// while it's set. The modal edits the CURRENTLY selected page's slot;
// selectedIdx can't change while the modal is open (it overlays the page list).
const editingButtonKey = ref<ButtonKey | null>(null);

const editingButtonValue = computed<PageButton | null>(() => {
  const page = currentPage.value;
  if (page === null || editingButtonKey.value === null) return null;
  return page[editingButtonKey.value];
});

const editingButtonNumber = computed(() =>
  editingButtonKey.value === null ? 0 : BUTTON_KEYS.indexOf(editingButtonKey.value) + 1,
);

function onEditRequested(key: ButtonKey) {
  editingButtonKey.value = key;
}

function onEditorChange(value: PageButton) {
  // editingButtonKey is non-null whenever the modal is mounted (it gates the
  // v-if), but guard anyway so a stray emit can't write to a null slot.
  if (editingButtonKey.value === null) return;
  remoteControlStore.setButton(selectedIdx.value, editingButtonKey.value, value);
  editingButtonKey.value = null;
}

function onEditorClose() {
  editingButtonKey.value = null;
}

// Total assigned (non-none) buttons across all pages — shown in the header
// as "N actions". Drives the "is the user actually configuring anything"
// signal without needing per-page math at render time.
const totalActions = computed(() => {
  let n = 0;
  for (const page of remoteControlPages.value) {
    for (const key of BUTTON_KEYS) {
      if (page[key].type !== 'none') n += 1;
    }
  }
  return n;
});

const pageCount = computed(() => remoteControlPages.value.length);
</script>

<template>
  <AstrosLayout>
    <template v-slot:main>
      <div
        class="flex flex-col overflow-hidden"
        style="height: calc(100vh - 64px)"
      >
        <!-- Header bar -->
        <div class="flex items-center gap-4 p-4 bg-r2-complement shrink-0">
          <h1 class="text-2xl font-bold">{{ t('remote_control_config.view.title') }}</h1>
          <div class="text-sm text-base-content/70">
            {{ t('remote_control_config.view.page_count', { count: pageCount }) }}
            ·
            {{ t('remote_control_config.view.action_count', { count: totalActions }) }}
          </div>
          <div class="grow"></div>
          <span
            v-if="isDirty"
            class="badge badge-warning"
            data-testid="unsaved-badge"
          >
            {{ t('remote_control_config.view.unsaved') }}
          </span>
          <AstrosWriteButton
            data-testid="save-config"
            class="btn btn-primary w-24"
            :disabled="isInitialLoading || loadFailed || isSaving || !isDirty"
            @click="saveConfig"
          >
            {{ t('remote_control_config.view.save') }}
          </AstrosWriteButton>
        </div>

        <!-- Initial-loading panel: blocks editor mount until all three
             loads resolve, so a user can't mutate empty/stale Pinia state
             during the load window (e.g., click Add against [] only to have
             the successful load replace the array). -->
        <div
          v-if="isInitialLoading"
          class="flex flex-1 items-center justify-center p-8"
          role="status"
          aria-live="polite"
          data-testid="initial-loading-state"
        >
          <div class="flex items-center gap-3">
            <span
              class="loading loading-spinner loading-md"
              aria-hidden="true"
            ></span>
            <span>{{ t('remote_control_config.view.loading') }}</span>
          </div>
        </div>

        <!-- Load-error banner: replaces the editor body entirely so the user
             can't make unsavable mutations against a half-loaded state. -->
        <div
          v-else-if="loadFailed"
          class="flex flex-1 items-center justify-center p-8"
          role="alert"
          data-testid="load-error-state"
        >
          <div class="alert alert-error max-w-xl">
            <span>{{ t('remote_control_config.view.load_error') }}</span>
          </div>
        </div>

        <!-- 3-pane body — only mounted when loads succeeded; otherwise the
             page list, cards, and preview are not in the DOM and can't fire
             store mutations. -->
        <div
          v-else
          class="flex flex-1 overflow-hidden"
        >
          <!-- Left: page list -->
          <aside
            class="flex flex-col w-[260px] border-r border-base-300"
            data-testid="pane-page-list"
          >
            <AstrosRemotePageList
              :pages="remoteControlPages"
              :selected-idx="selectedIdx"
              @select="onSelectPage"
              @add="onAddPage"
              @duplicate="onDuplicatePage"
              @delete="onDeleteRequest"
              @rename="onRenamePage"
            />
          </aside>

          <!-- Center: 3x3 grid (capped at 540px wide) -->
          <main
            class="flex-1 min-w-0 overflow-auto p-6"
            data-testid="pane-grid"
          >
            <div
              v-if="currentPage"
              class="grid grid-cols-3 gap-4 mx-auto"
              style="min-width: 500px; max-width: 540px"
            >
              <AstrosRemoteButtonCard
                v-for="key in BUTTON_KEYS"
                :key="key"
                :value="currentPage[key]"
                @edit="() => onEditRequested(key)"
                @change="(value) => onButtonChange(key, value)"
              />
            </div>
          </main>

          <!-- Right: live preview -->
          <aside
            class="flex flex-col border-l border-base-300"
            data-testid="pane-preview"
          >
            <AstrosRemoteLivePreview
              :pages="remoteControlPages"
              :selected-idx="selectedIdx"
            />
          </aside>
        </div>
      </div>

      <AstrosConfirmModal
        v-if="pendingDelete !== null"
        title="remote_control_config.deleteModal.title"
        message="remote_control_config.deleteModal.message"
        :message-params="{ name: pendingDelete.name }"
        :on-confirm="onDeleteConfirm"
        :on-close="onDeleteCancel"
      />

      <AstrosRemoteButtonEditorModal
        v-if="editingButtonValue !== null"
        :button-number="editingButtonNumber"
        :current-value="editingButtonValue"
        :scripts="scripts"
        :playlists="playlists"
        @change="onEditorChange"
        @close="onEditorClose"
      />
    </template>
  </AstrosLayout>
</template>
