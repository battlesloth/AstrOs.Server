<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { storeToRefs } from 'pinia';
import { AstrosLayout } from '@/components';
import AstrosRemoteButtonCard from '@/components/remoteControl/remoteButtonCard/AstrosRemoteButtonCard.vue';
import AstrosRemotePageList from '@/components/remoteControl/remotePageList/AstrosRemotePageList.vue';
import AstrosRemoteLivePreview from '@/components/remoteControl/remoteLivePreview/AstrosRemoteLivePreview.vue';
import AstrosWriteButton from '@/components/common/AstrosWriteButton.vue';
import { useRemoteControlStore } from '@/stores/remoteControl';
import { useScriptsStore } from '@/stores/scripts';
import { usePlaylistsStore } from '@/stores/playlists';
import { useToast } from '@/composables/useToast';
import { BUTTON_KEYS, type ButtonKey } from '@/models/remoteControl/remoteControlPage';

const { t } = useI18n();

const remoteControlStore = useRemoteControlStore();
const scriptStore = useScriptsStore();
const playlistStore = usePlaylistsStore();
const { success, error } = useToast();

const { remoteControlPages, selectedIdx, isDirty } = storeToRefs(remoteControlStore);

// Flipped true if the remote-config GET fails on mount; gates the Save
// button to prevent overwriting unloaded data.
const loadFailed = ref(false);
const scripts = ref<{ id: string; name: string }[]>([]);
const playlists = ref<{ id: string; name: string }[]>([]);

onMounted(async () => {
  const [scriptsResult, playlistsResult, remoteResult] = await Promise.all([
    scriptStore.loadScripts(),
    playlistStore.loadData(),
    remoteControlStore.loadRemoteControl(),
  ]);

  // ANY of the three loads failing disables editing — partial state would let
  // the user save a config that references scripts/playlists they couldn't
  // see in the editor dropdowns. The legacy view only gated on the remote
  // result and was vulnerable to that partial-load case.
  if (!scriptsResult.success || !playlistsResult.success || !remoteResult.success) {
    loadFailed.value = true;
    error(t('remote_control_config.view.load_error'));
    return;
  }

  scripts.value = scriptStore.scripts.map((s) => ({ id: s.id, name: s.scriptName }));
  playlists.value = playlistStore.playlists.map((p) => ({ id: p.id, name: p.playlistName }));
});

async function saveConfig() {
  // The store catches its own errors and resolves with {success: false, error}
  // rather than rejecting — a bare `await` here would never throw and every
  // failed PUT would render as a success toast. Inspect the flag.
  const result = await remoteControlStore.saveRemoteControl();
  if (result.success) {
    success(t('remote_control_config.view.save_success'));
  } else {
    console.error('Error saving remote control configuration:', result.error);
    error(t('remote_control_config.view.save_error'));
  }
}

const currentPage = computed(() => remoteControlPages.value[selectedIdx.value] ?? null);

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
            :disabled="loadFailed || !isDirty"
            @click="saveConfig"
          >
            {{ t('remote_control_config.view.save') }}
          </AstrosWriteButton>
        </div>

        <!-- 3-pane body -->
        <div class="flex flex-1 overflow-hidden">
          <!-- Left: page list -->
          <aside
            class="flex flex-col w-[220px] border-r border-base-300"
            data-testid="pane-page-list"
          >
            <AstrosRemotePageList
              :pages="remoteControlPages"
              :selected-idx="selectedIdx"
              @select="
                () => {
                  /* wired in Task 4 */
                }
              "
              @add="
                () => {
                  /* wired in Task 4 */
                }
              "
              @duplicate="
                () => {
                  /* wired in Task 4 */
                }
              "
              @delete="
                () => {
                  /* wired in Task 5 */
                }
              "
              @rename="
                () => {
                  /* wired in Task 4 */
                }
              "
            />
          </aside>

          <!-- Center: 3x3 grid (capped at 540px wide) -->
          <main
            class="flex-1 overflow-auto p-6"
            data-testid="pane-grid"
          >
            <div
              v-if="currentPage"
              class="grid grid-cols-3 gap-4 mx-auto"
              style="max-width: 540px"
            >
              <AstrosRemoteButtonCard
                v-for="(key, i) in BUTTON_KEYS"
                :key="key"
                :button-number="i + 1"
                :value="currentPage[key as ButtonKey]"
                :scripts="scripts"
                :playlists="playlists"
                @change="
                  () => {
                    /* wired in Task 6 */
                  }
                "
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
    </template>
  </AstrosLayout>
</template>
