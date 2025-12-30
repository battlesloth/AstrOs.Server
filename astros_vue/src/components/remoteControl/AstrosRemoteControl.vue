<script setup lang="ts">
import { ref, onMounted } from 'vue';
import AstrosRemoteButton from './AstrosRemoteButton.vue';
import type { RemoteControlPage } from '@/models/remoteControl/remoteControlPage';
import { useScriptsStore } from '@/stores/scripts';
import { useRemoteControlStore } from '@/stores/remoteControl';
import { useToast } from '@/composables/useToast';
import type { PageButton } from '@/models/remoteControl/pageButton';

interface ScriptSelection {
  id: string;
  name: string;
}

const scriptStore = useScriptsStore();
const remoteControlStore = useRemoteControlStore();
const { success, error } = useToast();

// State
const pageNumber = ref(1);
const scripts = ref<ScriptSelection[]>([]);
const currentPage = ref<RemoteControlPage | null>(null);
const currentIndex = ref(0);

const currentButton1Script = ref('0');
const currentButton2Script = ref('0');
const currentButton3Script = ref('0');
const currentButton4Script = ref('0');
const currentButton5Script = ref('0');
const currentButton6Script = ref('0');
const currentButton7Script = ref('0');
const currentButton8Script = ref('0');
const currentButton9Script = ref('0');

onMounted(async () => {
  await scriptStore.loadScripts();
  await remoteControlStore.loadRemoteControl();
  scripts.value = scriptStore.scripts.map((s) => ({ id: s.id, name: s.scriptName }));
  console.log('Loaded scripts for remote control:', scripts.value);
  if (remoteControlStore.remoteControlPages.length === 0) {
    remoteControlStore.remoteControlPages.push(createEmptyPage());
  }
  currentPage.value = remoteControlStore.remoteControlPages[0]!;
  setButtonScripts();
});

function createEmptyButton(): PageButton {
  return { id: '0', name: 'None' };
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

function selectionChange(button: number, newId: string) {
  let id = newId;
  let scriptName = 'None';

  if (id !== '0') {
    const sIdx = scripts.value.findIndex((s) => s.id === id);
    if (sIdx === -1) {
      console.error(`Script ID ${id} not found in scripts list.`);
      id = '0';
      scriptName = 'None';
    } else {
      scriptName = scripts.value[sIdx]!.name;
    }
  }

  const buttonKey = `button${button}` as keyof RemoteControlPage;
  if (!currentPage.value) return;
  currentPage.value[buttonKey] = { id, name: scriptName };
}

function pageForward() {
  currentIndex.value++;
  if (remoteControlStore.remoteControlPages.length < currentIndex.value + 1) {
    remoteControlStore.remoteControlPages.push(createEmptyPage());
  }

  currentPage.value = remoteControlStore.remoteControlPages[currentIndex.value]!;
  pageNumber.value = currentIndex.value + 1;
  setButtonScripts();
}

function pageBackward() {
  currentIndex.value--;
  if (currentIndex.value < 0) {
    currentIndex.value = 0;
    return;
  }

  currentPage.value = remoteControlStore.remoteControlPages[currentIndex.value]!;
  pageNumber.value = currentIndex.value + 1;
  setButtonScripts();
}

// Set button scripts from current page
function setButtonScripts() {
  currentButton1Script.value = currentPage.value?.button1?.id || '0';
  currentButton2Script.value = currentPage.value?.button2?.id || '0';
  currentButton3Script.value = currentPage.value?.button3?.id || '0';
  currentButton4Script.value = currentPage.value?.button4?.id || '0';
  currentButton5Script.value = currentPage.value?.button5?.id || '0';
  currentButton6Script.value = currentPage.value?.button6?.id || '0';
  currentButton7Script.value = currentPage.value?.button7?.id || '0';
  currentButton8Script.value = currentPage.value?.button8?.id || '0';
  currentButton9Script.value = currentPage.value?.button9?.id || '0';
}

async function saveConfig() {
  try {
    success('Remote control configuration saved successfully.');
  } catch (err) {
    console.error('Error saving remote control configuration:', err);
    error('Failed to save remote control configuration.');
  }
}
</script>

<template>
  <div class="w-full">
    <!-- Page Navigation -->
    <div class="flex flex-nowrap w-full my-5 items-center">
      <div class="grow-3"></div>
      <div>
        <button
          class="btn btn-circle btn-ghost text-2xl"
          title="Backward"
          @click="pageBackward"
        >
          &#8249;
        </button>
      </div>
      <div class="text-3xl mx-3 font-bold">Page {{ pageNumber }}</div>
      <div>
        <button
          class="btn btn-circle btn-ghost text-2xl"
          title="Forward"
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
      class="grid grid-cols-3 gap-5 w-full max-w-6xl mx-auto"
    >
      <!-- Button 1 -->
      <AstrosRemoteButton
        :currentScript="currentButton1Script"
        :scripts="scripts"
        @changed="(value) => selectionChange(1, value)"
      />
      <!-- Button 2 -->
      <AstrosRemoteButton
        :currentScript="currentButton2Script"
        :scripts="scripts"
        @changed="(value) => selectionChange(2, value)"
      />
      <!-- Button 3 -->
      <AstrosRemoteButton
        :currentScript="currentButton3Script"
        :scripts="scripts"
        @changed="(value) => selectionChange(3, value)"
      />
      <!-- Button 4 -->
      <AstrosRemoteButton
        :currentScript="currentButton4Script"
        :scripts="scripts"
        @changed="(value) => selectionChange(4, value)"
      />
      <!-- Button 5 -->
      <AstrosRemoteButton
        :currentScript="currentButton5Script"
        :scripts="scripts"
        @changed="(value) => selectionChange(5, value)"
      />
      <!-- Button 6 -->
      <AstrosRemoteButton
        :currentScript="currentButton6Script"
        :scripts="scripts"
        @changed="(value) => selectionChange(6, value)"
      />
      <!-- Button 7 -->
      <AstrosRemoteButton
        :currentScript="currentButton7Script"
        :scripts="scripts"
        @changed="(value) => selectionChange(7, value)"
      />
      <!-- Button 8 -->
      <AstrosRemoteButton
        :currentScript="currentButton8Script"
        :scripts="scripts"
        @changed="(value) => selectionChange(8, value)"
      />
      <!-- Button 9 -->
      <AstrosRemoteButton
        :currentScript="currentButton9Script"
        :scripts="scripts"
        @changed="(value) => selectionChange(9, value)"
      />
    </div>
    <!-- Save Button -->
    <div class="flex justify-center mt-8">
      <button
        class="btn btn-primary btn-wide"
        @click="saveConfig"
      >
        Save Configuration
      </button>
    </div>
  </div>
</template>
