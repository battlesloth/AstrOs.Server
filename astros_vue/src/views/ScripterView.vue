<script setup lang="ts">
import { onMounted, ref, useTemplateRef } from 'vue';
import { ModalType } from '@/enums/modalType';
import { useScripterStore } from '@/stores/scripter';
import { useRoute } from 'vue-router';
import AstrosLayout from '@/components/common/layout/AstrosLayout.vue';
import AstrosPixiView from '@/components/scripter/AstrosPixiView.vue';

import AstrosAddChannelModal from '@/components/modals/scripter/AstrosAddChannelModal.vue';
import AstrosScriptTestModal from '@/components/modals/scripter/AstrosScriptTestModal.vue';
import AstrosChannelTestModal from '@/components/modals/scripter/AstrosChannelTestModal.vue';
import AstrosGpioEventModal from '@/components/modals/scripter/AstrosGpioEventModal.vue';
import AstrosHumanCyborgModal from '@/components/modals/scripter/AstrosHumanCyborgModal.vue';
import AstrosI2cEventModal from '@/components/modals/scripter/AstrosI2cEventModal.vue';
import AstrosKangarooEventModal from '@/components/modals/scripter/AstrosKangarooEventModal.vue';
import AstrosServoEventModal from '@/components/modals/scripter/AstrosServoEventModal.vue';
import AstrosUartEventModal from '@/components/modals/scripter/AstrosUartEventModal.vue';
import { ScriptChannelType } from '@/enums/scripts/scriptChannelType';
import AstrosInterruptModal from '@/components/modals/AstrosInterruptModal.vue';
import AstrosAlertModal from '@/components/modals/AstrosAlertModal.vue';
import router from '@/router';
import AstrosConfirmModal from '@/components/modals/AstrosConfirmModal.vue';
import type { AddChannelModalResponse } from '@/models/scripts/scripting';

const scripter = useTemplateRef('scripter');

const showModal = ref<ModalType>(ModalType.INTERRUPT);
const modalAction = ref<() => void>(() => {});
const modalMessage = ref<string>('Loading...');
const scriptLoadFailed = ref<boolean>(false);

const route = useRoute();
const scripterStore = useScripterStore();

function addChannel() {
  showModal.value = ModalType.ADD_CHANNEL;
}

function doAddChannel(response: AddChannelModalResponse) {
  showModal.value = ModalType.CLOSE_ALL;
  let map = scripterStore.getChannelDetailsMap();
  for (const [channelType, ids] of response.channels.entries()) {
    for (const id of ids) {
      const result = scripterStore.addChannel(id, channelType);

      if (!result.success) {
        console.log(`Failed to add channel for ID ${id} and type ${channelType}`);
        continue;
      }

      scripter.value?.addChannel(result.id, result.name);
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

function addEvent() {}
function doAddEvent() {}

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
        :script-event="{
          scriptChannel: '',
          moduleType: 0,
          moduleSubType: 0,
          time: 0,
          event: { setHigh: false },
        }"
      />
      <AstrosHumanCyborgModal
        v-if="showModal === ModalType.HCR_EVENT"
        @close="showModal = ModalType.CLOSE_ALL"
        :script-event="{
          scriptChannel: '',
          moduleType: 0,
          moduleSubType: 0,
          time: 0,
          event: { commands: [] },
        }"
      />
      <AstrosI2cEventModal
        v-if="showModal === ModalType.I2C_EVENT"
        @close="showModal = ModalType.CLOSE_ALL"
        :script-event="{
          scriptChannel: '',
          moduleType: 0,
          moduleSubType: 0,
          time: 0,
          event: { message: '' },
        }"
      />
      <AstrosKangarooEventModal
        v-if="showModal === ModalType.KANGAROO_EVENT"
        @close="showModal = ModalType.CLOSE_ALL"
        :kangaroo="{
          id: '',
          ch1Name: 'ch 1',
          ch2Name: 'ch 2',
        }"
        :script-event="{
          scriptChannel: '',
          moduleType: 0,
          moduleSubType: 0,
          time: 0,
          event: {
            ch1Action: 0,
            ch1Speed: 0,
            ch1Position: 0,
            ch2Action: 0,
            ch2Speed: 0,
            ch2Position: 0,
          },
        }"
      />
      <AstrosServoEventModal
        v-if="showModal === ModalType.SERVO_EVENT"
        @close="showModal = ModalType.CLOSE_ALL"
        :script-event="{
          scriptChannel: '',
          moduleType: 0,
          moduleSubType: 0,
          time: 0,
          event: { channel: 0, position: 0, speed: 0, acceleration: 0, isServo: false },
        }"
      />
      <AstrosUartEventModal
        v-if="showModal === ModalType.UART_EVENT"
        @close="showModal = ModalType.CLOSE_ALL"
        :script-event="{
          scriptChannel: '',
          moduleType: 0,
          moduleSubType: 0,
          time: 0,
          event: { value: '' },
        }"
      />
    </template>
  </AstrosLayout>
</template>
