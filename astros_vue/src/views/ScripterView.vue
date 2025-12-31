<script setup lang="ts">
import { onMounted, ref, useTemplateRef } from 'vue';
import { ModalType, ScriptChannelType } from '@/enums';
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
import type { AddChannelModalResponse, ScriptEvent } from '@/models';
import { useScriptEvents } from '@/composables/useScriptEvents';

const scripter = useTemplateRef('scripter');

const showModal = ref<ModalType>(ModalType.INTERRUPT);
const modalAction = ref<() => void>(() => {});
const modalMessage = ref<string>('Loading...');
const scriptLoadFailed = ref<boolean>(false);

const selectedScriptEvent = ref<ScriptEvent | null>(null);

const route = useRoute();
const scripterStore = useScripterStore();

const { eventTypeToModalType, getDefaultScriptEvent } = useScriptEvents();

function addChannel() {
  showModal.value = ModalType.ADD_CHANNEL;
}

function doAddChannel(response: AddChannelModalResponse) {
  showModal.value = ModalType.CLOSE_ALL;
  let map = scripterStore.getChannelDetailsMap();
  for (const [channelType, detailList ] of response.channels.entries()) {
    for (const detail of detailList) {
      const result = scripterStore.addChannel(detail.id, channelType);

      if (!result.success) {
        console.log(`Failed to add channel for ID ${detail.id} and type ${channelType}`);
        continue;
      }

      scripter.value?.addChannel(result.id, result.name, channelType);
    }
  }
  map = scripterStore.getChannelDetailsMap();
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
function doSwapChannel() {}

function addEvent(chId: string, time: number) {
  const channel = scripterStore.getChannel(chId);

  if (!channel) {
    console.log(`Channel with ID ${chId} not found.`);
    return;
  }

  selectedScriptEvent.value = {
    scriptChannelId: chId,
    moduleType: channel.moduleChannel.moduleType ,
    moduleSubType: channel.moduleChannel.moduleSubType,
    time: time,
    event: getDefaultScriptEvent(channel.moduleChannel.moduleType, channel.moduleChannel.moduleSubType),
  };  

  showModal.value = eventTypeToModalType(
    channel.moduleChannel.moduleType,
    channel.moduleChannel.moduleSubType,
  );
}

function doAddEvent(event: ScriptEvent) {
  if (!selectedScriptEvent.value) {
    console.log('No selected script event to add.');
    return;
  }

  /*scripterStore.addEventToChannel(
    selectedScriptEvent.value.scriptChannelId,
    event,
  );*/
  scripter.value?.addEvent(
    event,
  );

  selectedScriptEvent.value = null;
}

function removeEvent() {}
function doRemoveEvent() {}

function updateEvent() {}
function doUpdateEvent() {}

function testChannel() {}
function scriptTest() {}

function alertClose() {
  if (scriptLoadFailed.value) {
    router.push('/scripts');
    return;
  }
  showModal.value = ModalType.CLOSE_ALL;
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
  await scripter.value?.initializePixi();
  showModal.value = ModalType.CLOSE_ALL;
});
</script>

<template>
  <AstrosLayout>
    <template v-slot:main>
      <AstrosPixiView
        ref="scripter"
        @add-channel="addChannel"
        @remove-channel="removeChannel"
        @swap-channel="swapChannel"
        @test-channel="testChannel"
        @add-event="addEvent"
        @remove-event="removeEvent"
        @edit-event="updateEvent"
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
        v-if="showModal === ModalType.GPIO_EVENT"
        @close="showModal = ModalType.CLOSE_ALL"
        :script-event="selectedScriptEvent!"
      />
      <AstrosHumanCyborgModal
        v-if="showModal === ModalType.HCR_EVENT"
        @close="showModal = ModalType.CLOSE_ALL"
        :script-event="selectedScriptEvent!"
      />
      <AstrosI2cEventModal
        v-if="showModal === ModalType.I2C_EVENT"
        @close="showModal = ModalType.CLOSE_ALL"
        :script-event="selectedScriptEvent!"
      />
      <AstrosKangarooEventModal
        v-if="showModal === ModalType.KANGAROO_EVENT"
        @close="showModal = ModalType.CLOSE_ALL"
        :kangaroo="{
          id: '',
          ch1Name: 'ch 1',
          ch2Name: 'ch 2',
        }"
        :script-event="selectedScriptEvent!"
      />
      <AstrosServoEventModal
        v-if="showModal === ModalType.SERVO_EVENT"
        @close="showModal = ModalType.CLOSE_ALL"
        :script-event="selectedScriptEvent!"
      />
      <AstrosUartEventModal
        v-if="showModal === ModalType.UART_EVENT"
        @close="showModal = ModalType.CLOSE_ALL"
        :script-event="selectedScriptEvent!"
      />
    </template>
  </AstrosLayout>
</template>
