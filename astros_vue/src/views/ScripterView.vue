<script setup lang="ts">
import { onMounted, ref, useTemplateRef } from 'vue';
import { ModalMode, ModalType, ScriptChannelType } from '@/enums';
import { useScripterStore } from '@/stores/scripter';
import { useRoute } from 'vue-router';
import {
  AstrosLayout,
  AstrosPixiView,
  AstrosAddChannelModal,
  AstrosScriptTestModal,
  AstrosChannelTestModal,
  AstrosGpioEventModal,
  AstrosHumanCyborgModal,
  AstrosI2cEventModal,
  AstrosKangarooEventModal,
  AstrosServoEventModal,
  AstrosUartEventModal,
  AstrosInterruptModal,
  AstrosAlertModal,
  AstrosConfirmModal,
} from '@/components';
import router from '@/router';
import type { AddChannelModalResponse, ScriptEvent, Channel } from '@/models';
import { useScriptEvents } from '@/composables/useScriptEvents';
import { useToast } from '@/composables/useToast';
import { v4 as uuid } from 'uuid';

const scripter = useTemplateRef('scripter');

const showModal = ref<ModalType>(ModalType.INTERRUPT);
const modalAction = ref<() => void>(() => {});
const modalMessage = ref<string>('Loading...');
const scriptLoadFailed = ref<boolean>(false);

const selectedScriptEvent = ref<ScriptEvent | null>(null);
const modalMode = ref<ModalMode>(ModalMode.ADD);

const route = useRoute();
const scripterStore = useScripterStore();

const { eventTypeToModalType, getDefaultScriptEvent } = useScriptEvents();

const { success } = useToast();

function addChannel() {
  showModal.value = ModalType.ADD_CHANNEL;
}

function doAddChannel(response: AddChannelModalResponse) {
  showModal.value = ModalType.CLOSE_ALL;
  for (const [channelType, detailList] of response.channels.entries()) {
    for (const detail of detailList) {
      const result = scripterStore.addChannel(detail.id, channelType);

      if (!result.success) {
        console.log(`Failed to add channel for ID ${detail.id} and type ${channelType}`);
        continue;
      }

      const ch: Channel = {
        id: result.id,
        name: result.name,
        channelType: channelType,
        events: [],
      };

      scripter.value?.addChannel(ch);
    }
  }
}

function removeChannel(id: string, name: string) {
  modalMessage.value = `Are you sure you want to remove channel "${name}"?`;
  showModal.value = ModalType.CONFIRM;
  modalAction.value = () => doRemoveChannel(id);
}

function doRemoveChannel(chId: string) {
  scripterStore.removeChannel(chId);
  scripter.value?.removeChannel(chId);
}

function swapChannel() {}
//function doSwapChannel() {}

function addEvent(chId: string, time: number) {
  modalMode.value = ModalMode.ADD;
  const channel = scripterStore.getChannel(chId);

  if (!channel) {
    console.log(`Channel with ID ${chId} not found.`);
    return;
  }

  selectedScriptEvent.value = {
    id: uuid(),
    scriptChannel: chId,
    moduleType: channel.moduleChannel.moduleType,
    moduleSubType: channel.moduleChannel.moduleSubType,
    time: time,
    event: getDefaultScriptEvent(
      channel.moduleChannel.moduleType,
      channel.moduleChannel.moduleSubType,
    ),
  };

  showModal.value = eventTypeToModalType(channel.channelType);
}

function doAddEvent() {
  if (!selectedScriptEvent.value) {
    console.log('No selected script event to add.');
    return;
  }

  if (modalMode.value === ModalMode.ADD) {
    const result = scripterStore.addEventToChannel(
      selectedScriptEvent.value.scriptChannel,
      selectedScriptEvent.value,
    );

    scripter.value?.addEvent(selectedScriptEvent.value, result.channelType);
  } else {
    // Edit mode - update the visual timeline position
    scripter.value?.updateEvent(
      selectedScriptEvent.value.scriptChannel,
      selectedScriptEvent.value.id,
    );
  }

  selectedScriptEvent.value = null;
  showModal.value = ModalType.CLOSE_ALL;
}

function editEvent(event: ScriptEvent) {
  modalMode.value = ModalMode.EDIT;
  selectedScriptEvent.value = event;

  const channel = scripterStore.getChannel(event.scriptChannel);

  if (!channel) {
    console.log(`Channel with ID ${event.scriptChannel} not found.`);
    return;
  }

  showModal.value = eventTypeToModalType(channel.channelType);
}

function removeEvent() {}
function doRemoveEvent() {
  if (!selectedScriptEvent.value) {
    console.log('No selected script event to remove.');
    return;
  }

  scripterStore.removeEventFromChannel(
    selectedScriptEvent.value.scriptChannel,
    selectedScriptEvent.value.id,
  );

  scripter.value?.removeEvent(
    selectedScriptEvent.value.scriptChannel,
    selectedScriptEvent.value.id,
  );

  selectedScriptEvent.value = null;
  showModal.value = ModalType.CLOSE_ALL;
}

function testChannel() {}
function scriptTest() {}

async function saveScript() {
  const result = await scripterStore.saveScript();
  if (!result.success) {
    modalMessage.value = `Failed to save script: ${result.error}`;
    showModal.value = ModalType.ERROR;
  } else {
    success('Script saved successfully.');
  }
}

function alertClose() {
  if (scriptLoadFailed.value) {
    router.push('/scripts');
    return;
  }
  showModal.value = ModalType.CLOSE_ALL;
}

function eventModalClose() {
  showModal.value = ModalType.CLOSE_ALL;
  selectedScriptEvent.value = null;
}

function confirm() {
  modalAction.value();
  showModal.value = ModalType.CLOSE_ALL;
}

onMounted(async () => {
  if (!route.params.id) {
    modalMessage.value = 'No script ID provided.';
    scriptLoadFailed.value = true;
    showModal.value = ModalType.ERROR;
    return;
  }

  const result = await scripterStore.loadScripterData(route.params.id as string);

  if (!result.success) {
    modalMessage.value = `Failed to load script: ${result.error}`;
    scriptLoadFailed.value = true;
    showModal.value = ModalType.ERROR;
    return;
  }

  modalMessage.value = 'Initializing...';

  const scriptChannels = scripterStore.script?.scriptChannels;

  const channels: Channel[] = [];
  if (scriptChannels) {
    for (const sc of scriptChannels) {
      const ch: Channel = {
        id: sc.id,
        name: sc.moduleChannel.channelName,
        channelType: sc.channelType,
        events: Object.values(sc.events),
      };
      channels.push(ch);
    }
  }

  await scripter.value?.initializePixi(channels);
  showModal.value = ModalType.CLOSE_ALL;
});
</script>

<template>
  <AstrosLayout>
    <template v-slot:main>
      <div v-if="scripterStore.script">
        <div class="flex m-8 mb-4 items-center gap-4">
          <div class="w-1/4 text-2xl font-bold">
            <input
              v-model="scripterStore.script.scriptName"
              class="bg-transparent border border-gray-400 focus:outline-none w-full"
              placeholder="Script Name"
            />
          </div>
          <div class="grow text-2xl flex items-center gap-2">
            <input
              v-model.number="scripterStore.script.description"
              class="bg-transparent border border-gray-400 focus:outline-none w-full"
              min="0"
            />
          </div>
          <button
            class="btn w-24 btn-primary"
            @click="saveScript"
          >
            Save
          </button>
          <button
            class="btn w-24 btn-primary"
            @click="scriptTest"
          >
            Test
          </button>
        </div>
      </div>
      <AstrosPixiView
        ref="scripter"
        @add-channel="addChannel"
        @remove-channel="removeChannel"
        @swap-channel="swapChannel"
        @test-channel="testChannel"
        @add-event="addEvent"
        @remove-event="removeEvent"
        @edit-event="editEvent"
      />

      <AstrosInterruptModal
        v-if="showModal === ModalType.INTERRUPT"
        @close="showModal = ModalType.CLOSE_ALL"
        :message="modalMessage"
      />
      <AstrosAlertModal
        v-if="showModal === ModalType.ERROR"
        @close="alertClose"
        :message="modalMessage"
      />
      <AstrosConfirmModal
        v-if="showModal === ModalType.CONFIRM"
        @close="showModal = ModalType.CLOSE_ALL"
        @confirm="confirm"
        :message="modalMessage"
      />
      <AstrosAddChannelModal
        v-if="showModal === ModalType.ADD_CHANNEL"
        @close="showModal = ModalType.CLOSE_ALL"
        @add-channel="doAddChannel"
      />

      <AstrosScriptTestModal
        v-if="showModal === ModalType.SCRIPT_TEST"
        @close="showModal = ModalType.CLOSE_ALL"
        :script-id="''"
      />
      <AstrosChannelTestModal
        v-if="showModal === ModalType.CHANNEL_TEST"
        @close="showModal = ModalType.CLOSE_ALL"
        :controller-id="0"
        :script-channel-type="ScriptChannelType.NONE"
        :channel-id="0"
      />

      <AstrosGpioEventModal
        v-if="showModal === ModalType.GPIO_EVENT && selectedScriptEvent"
        v-model:script-event="selectedScriptEvent"
        @close="eventModalClose"
        @save="doAddEvent"
        @remove="doRemoveEvent"
        :mode="modalMode"
      />
      <AstrosHumanCyborgModal
        v-if="showModal === ModalType.HCR_EVENT && selectedScriptEvent"
        v-model:script-event="selectedScriptEvent"
        @close="eventModalClose"
        @save="doAddEvent"
        @remove="doRemoveEvent"
        :mode="modalMode"
      />
      <AstrosI2cEventModal
        v-if="showModal === ModalType.I2C_EVENT && selectedScriptEvent"
        v-model:script-event="selectedScriptEvent"
        @close="eventModalClose"
        @save="doAddEvent"
        @remove="doRemoveEvent"
        :mode="modalMode"
      />
      <AstrosKangarooEventModal
        v-if="showModal === ModalType.KANGAROO_EVENT && selectedScriptEvent"
        v-model:script-event="selectedScriptEvent"
        @close="eventModalClose"
        @save="doAddEvent"
        @remove="doRemoveEvent"
        :mode="modalMode"
        :kangaroo="{
          id: '',
          ch1Name: 'ch 1',
          ch2Name: 'ch 2',
        }"
      />
      <AstrosServoEventModal
        v-if="showModal === ModalType.SERVO_EVENT && selectedScriptEvent"
        v-model:script-event="selectedScriptEvent"
        @close="eventModalClose"
        @save="doAddEvent"
        @remove="doRemoveEvent"
        :mode="modalMode"
      />
      <AstrosUartEventModal
        v-if="showModal === ModalType.UART_EVENT && selectedScriptEvent"
        v-model:script-event="selectedScriptEvent"
        @close="eventModalClose"
        @save="doAddEvent"
        @remove="doRemoveEvent"
        :mode="modalMode"
      />
    </template>
  </AstrosLayout>
</template>
