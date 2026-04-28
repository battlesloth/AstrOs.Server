<script setup lang="ts">
import { ref, onMounted } from 'vue';
import AstrosRemoteButton from './AstrosRemoteButton.vue';
import AstrosWriteButton from '@/components/common/AstrosWriteButton.vue';
import type { RemoteControlPage } from '@/models/remoteControl/remoteControlPage';
import type { PageButton } from '@/models/remoteControl/pageButton';
import { useScriptsStore } from '@/stores/scripts';
import { usePlaylistsStore } from '@/stores/playlists';
import { useRemoteControlStore } from '@/stores/remoteControl';
import { useToast } from '@/composables/useToast';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();

interface SelectionItem {
  id: string;
  name: string;
}

const scriptStore = useScriptsStore();
const playlistStore = usePlaylistsStore();
const remoteControlStore = useRemoteControlStore();
const { success, error } = useToast();

const pageNumber = ref(1);
const scripts = ref<SelectionItem[]>([]);
const playlists = ref<SelectionItem[]>([]);
const currentPage = ref<RemoteControlPage | null>(null);
const currentIndex = ref(0);

onMounted(async () => {
  await Promise.all([
    scriptStore.loadScripts(),
    playlistStore.loadData(),
    remoteControlStore.loadRemoteControl(),
  ]);

  scripts.value = scriptStore.scripts.map((s) => ({ id: s.id, name: s.scriptName }));
  playlists.value = playlistStore.playlists.map((p) => ({ id: p.id, name: p.playlistName }));

  if (remoteControlStore.remoteControlPages.length === 0) {
    remoteControlStore.remoteControlPages.push(createEmptyPage());
  }
  currentPage.value = remoteControlStore.remoteControlPages[0]!;
});

function createEmptyButton(): PageButton {
  return { id: '0', name: 'None', type: 'none' };
}

function createEmptyPage(): RemoteControlPage {
  return {
    button1: createEmptyButton(),
    button2: createEmptyButton(),
    button3: createEmptyButton(),
    button4: createEmptyButton(),
    button5: createEmptyButton(),
    button6: createEmptyButton(),
    button7: createEmptyButton(),
    button8: createEmptyButton(),
    button9: createEmptyButton(),
  };
}

function selectionChange(button: number, value: PageButton) {
  const buttonKey = `button${button}` as keyof RemoteControlPage;
  if (!currentPage.value) return;
  currentPage.value[buttonKey] = value;
}

function pageForward() {
  currentIndex.value++;
  if (remoteControlStore.remoteControlPages.length < currentIndex.value + 1) {
    remoteControlStore.remoteControlPages.push(createEmptyPage());
  }
  currentPage.value = remoteControlStore.remoteControlPages[currentIndex.value]!;
  pageNumber.value = currentIndex.value + 1;
}

function pageBackward() {
  currentIndex.value--;
  if (currentIndex.value < 0) {
    currentIndex.value = 0;
    return;
  }
  currentPage.value = remoteControlStore.remoteControlPages[currentIndex.value]!;
  pageNumber.value = currentIndex.value + 1;
}

async function saveConfig() {
  try {
    await remoteControlStore.saveRemoteControl();
    success(t('remote_view.save_success'));
  } catch (err) {
    console.error('Error saving remote control configuration:', err);
    error(t('remote_view.save_error'));
  }
}

const buttonNumbers = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;
</script>

<template>
  <div class="w-full">
    <div class="flex items-center gap-4 p-4 bg-r2-complement shrink-0">
      <h1 class="text-2xl font-bold">{{ $t('remote_view.title') }}</h1>
      <div class="grow"></div>
      <AstrosWriteButton
        data-testid="save_module_settings"
        class="btn btn-primary w-24"
        @click="saveConfig"
      >
        {{ $t('remote_view.save') }}
      </AstrosWriteButton>
    </div>

    <!-- Page Navigation -->
    <div class="flex flex-nowrap w-full my-5 items-center">
      <div class="grow-3"></div>
      <div>
        <button
          class="btn btn-circle btn-ghost text-2xl"
          :title="$t('remote_view.backward')"
          :aria-label="$t('remote_view.backward')"
          @click="pageBackward"
        >
          &#8249;
        </button>
      </div>
      <div class="text-3xl mx-3 font-bold">{{ $t('remote_view.page') }} {{ pageNumber }}</div>
      <div>
        <button
          class="btn btn-circle btn-ghost text-2xl"
          :title="$t('remote_view.forward')"
          :aria-label="$t('remote_view.forward')"
          @click="pageForward"
        >
          &#8250;
        </button>
      </div>
      <div class="grow-3"></div>
    </div>

    <!-- Grid of Button Selects -->
    <div
      v-if="currentPage"
      class="grid grid-cols-3 gap-5 w-full max-w-6xl mx-auto px-4"
    >
      <AstrosRemoteButton
        v-for="n in buttonNumbers"
        :key="n"
        :buttonNumber="n"
        :currentValue="currentPage[`button${n}` as keyof RemoteControlPage]"
        :scripts="scripts"
        :playlists="playlists"
        @changed="(value) => selectionChange(n, value)"
      />
    </div>
  </div>
</template>
