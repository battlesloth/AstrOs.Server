<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { ScriptChannelType } from '@/enums/scripts/scriptChannelType';
import { KangarooAction } from '@/enums';
import { type ChannelTestModalResponse } from '@/models';

const props = defineProps<{
  controllerId: number;
  scriptChannelType: ScriptChannelType;
  channelId: number;
}>();

const emit = defineEmits<{
  test: [response: ChannelTestModalResponse];
  close: [];
}>();

// Servo state
const speed = ref(1);
const position = ref(0);

// Generic I2C/UART state
const value = ref('');

// GPIO state
const gpioLevel = ref(0);

// Kangaroo state
const kangarooCh = ref(1);
const kangarooAction = ref(1);
const kangarooSpd = ref<number>();
const kangarooPos = ref<number>();

const spdDisabled = computed(() => {
  return kangarooAction.value !== 3 && kangarooAction.value !== 4;
});

const posDisabled = computed(() => {
  return kangarooAction.value !== 4;
});

// Watch kangaroo action changes to clear disabled values
watch(kangarooAction, (newAction) => {
  if (newAction !== 3 && newAction !== 4) {
    kangarooSpd.value = 0;
  }
  if (newAction !== 4) {
    kangarooPos.value = 0;
  }
});

const clampPosition = () => {
  if (position.value < 0) position.value = 0;
  if (position.value > 100) position.value = 100;
};

const clampSpeed = () => {
  if (speed.value < 0) speed.value = 0;
  if (speed.value > 10) speed.value = 10;
};

const getKangarooCommand = (): string => {
  let cmd = '';

  switch (kangarooAction.value) {
    case KangarooAction.START:
      cmd = 'start';
      break;
    case KangarooAction.HOME:
      cmd = 'home';
      break;
    case KangarooAction.SPEED:
      cmd = `s${kangarooSpd.value === undefined ? 0 : kangarooSpd.value}`;
      break;
    case KangarooAction.POSITION:
      cmd = `p${kangarooPos.value === undefined ? 0 : kangarooPos.value} s${kangarooSpd.value === undefined ? 0 : kangarooSpd.value}`;
      break;
  }

  return `${kangarooCh.value},${cmd}`;
};

const getCommand = (): unknown => {
  switch (props.scriptChannelType) {
    case ScriptChannelType.GENERIC_I2C:
      return { id: props.channelId, val: value.value };
    case ScriptChannelType.SERVO:
      return {
        id: props.channelId,
        position: position.value,
        speed: speed.value,
      };
    case ScriptChannelType.GENERIC_UART:
      return { val: value.value };
    case ScriptChannelType.KANGAROO:
      return { val: getKangarooCommand() };
    case ScriptChannelType.GPIO:
      return { id: props.channelId, val: gpioLevel.value };
  }
  return {};
};

const runClicked = () => {
  emit('test', {
    controllerId: props.controllerId,
    commandType: props.scriptChannelType,
    command: getCommand(),
  });
};

const closeModal = () => {
  emit('close');
};
</script>

<template>
  <dialog class="modal modal-open">
    <div class="modal-box w-100 max-w-md">
      <h1 class="text-2xl font-bold mb-4">Channel Test</h1>

      <div class="py-4 flex flex-row">
        <div class="grow"></div>
        <div class="w-75">
          <!-- Servo Controls -->
          <div v-if="scriptChannelType === ScriptChannelType.SERVO">
            <div class="mb-2">
              <label
                for="position"
                class="block w-full mb-0.5 text-lg"
                >Position</label
              >
              <input
                id="position"
                v-model.number="position"
                type="number"
                min="0"
                max="100"
                class="input input-bordered w-full text-lg h-9"
                @change="clampPosition"
              />
            </div>
            <div class="mb-2">
              <label
                for="speed"
                class="block w-full mb-0.5 text-lg"
                >Speed</label
              >
              <input
                id="speed"
                v-model.number="speed"
                type="number"
                min="0"
                max="10"
                class="input input-bordered w-full text-lg h-9"
                @change="clampSpeed"
              />
            </div>
          </div>

          <!-- GPIO Controls -->
          <div v-if="scriptChannelType === ScriptChannelType.GPIO">
            <label
              for="gpiolevel"
              class="block w-full mb-0.5 text-lg"
              >GPIO Command</label
            >
            <select
              id="gpiolevel"
              v-model.number="gpioLevel"
              title="GPIO Level"
              class="select select-bordered w-full text-lg mt-2"
            >
              <option :value="0">Low</option>
              <option :value="1">High</option>
            </select>
          </div>

          <!-- I2C Controls -->
          <div v-if="scriptChannelType === ScriptChannelType.GENERIC_I2C">
            <label
              for="i2c-value"
              class="block w-full mb-0.5 text-lg"
              >I2C Command</label
            >
            <input
              id="i2c-value"
              v-model="value"
              type="text"
              placeholder="Value"
              class="input input-bordered w-full text-lg h-9 mb-2"
            />
          </div>

          <!-- Serial/UART Controls -->
          <div v-if="scriptChannelType === ScriptChannelType.GENERIC_UART">
            <label
              for="uart-value"
              class="block w-full mb-0.5 text-lg"
              >Serial Command</label
            >
            <input
              id="uart-value"
              v-model="value"
              type="text"
              placeholder="Value"
              class="input input-bordered w-full text-lg h-9 mb-2"
            />
          </div>

          <!-- Kangaroo Controls -->
          <div v-if="scriptChannelType === ScriptChannelType.KANGAROO">
            <div class="mb-2">
              <label
                for="chselect"
                class="block w-full mb-0.5 text-lg"
                >Kangaroo Channel</label
              >
              <select
                id="chselect"
                v-model.number="kangarooCh"
                title="Kangaroo channel"
                class="select select-bordered w-full text-lg mt-2"
              >
                <option :value="1">Channel 1</option>
                <option :value="2">Channel 2</option>
              </select>
            </div>
            <div class="mb-2">
              <label
                for="cmdselect"
                class="block w-full mb-0.5 text-lg"
                >Command</label
              >
              <select
                id="cmdselect"
                v-model.number="kangarooAction"
                title="Command"
                class="select select-bordered w-full text-lg mt-2"
              >
                <option :value="1">Start</option>
                <option :value="2">Home</option>
                <option :value="3">Speed</option>
                <option :value="4">Position</option>
              </select>
            </div>
            <div class="mb-2">
              <label
                for="chspd"
                class="block w-full mb-0.5 text-lg"
                >Speed</label
              >
              <input
                id="chspd"
                v-model.number="kangarooSpd"
                type="number"
                placeholder="Speed"
                :disabled="spdDisabled"
                class="input input-bordered w-full text-lg h-9"
              />
              <label
                for="chpos"
                class="block w-full mb-0.5 text-lg mt-2"
                >Position</label
              >
              <input
                id="chpos"
                v-model.number="kangarooPos"
                type="number"
                placeholder="Position"
                :disabled="posDisabled"
                class="input input-bordered w-full text-lg h-9"
              />
            </div>
          </div>
        </div>
        <div class="grow"></div>
      </div>

      <div class="modal-action justify-center mt-5">
        <button
          class="btn btn-primary w-24 text-lg"
          data-testid="send-button"
          @click="runClicked"
        >
          Send
        </button>
        <button
          class="btn w-24 text-lg"
          data-testid="cancel-button"
          @click="closeModal"
        >
          Cancel
        </button>
      </div>
    </div>
    <form
      method="dialog"
      class="modal-backdrop"
      @click="closeModal"
    >
      <button>Close</button>
    </form>
  </dialog>
</template>
