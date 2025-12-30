<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { ModuleSubType } from '@/enums/modules/ModuleSubType';
import {
  type GpioEvent,
  type MaestroEvent,
  type ScriptEvent,
  type ScriptEventModalResponse,
} from '@/models/scripts/scripting';

export type GpioEventModalMode = 'add' | 'edit';

const props = withDefaults(
  defineProps<{
    scriptEvent: ScriptEvent;
    mode?: GpioEventModalMode;
  }>(),
  {
    mode: 'add',
  },
);

const emit = defineEmits<{
  addEvent: [response: ScriptEventModalResponse];
  editEvent: [response: ScriptEventModalResponse];
  removeEvent: [response: ScriptEventModalResponse];
  close: [];
}>();

// Constants
const maxTime = 3000;
const timeFactor = 10;

// Local state
const state = ref(0);
const eventTime = ref(0);
const originalEventTime = ref(0);
const errorMessage = ref('');

const showRemoveButton = computed(() => props.mode === 'edit');

onMounted(() => {
  // Initialize state based on scriptEvent
  if (props.scriptEvent.event === undefined) {
    state.value = 0;
  } else if (props.scriptEvent.moduleSubType === ModuleSubType.genericGpio) {
    const temp = props.scriptEvent.event as GpioEvent;
    state.value = temp.setHigh ? 1 : 0;
  } else if (props.scriptEvent.moduleSubType === ModuleSubType.maestro) {
    const temp = props.scriptEvent.event as MaestroEvent;
    state.value = temp.position >= 1500 ? 1 : 0;
  }

  originalEventTime.value = props.scriptEvent.time / timeFactor;
  eventTime.value = props.scriptEvent.time / timeFactor;
});

const addEvent = () => {
  if (eventTime.value > maxTime) {
    errorMessage.value = `Event time cannot be larger than ${maxTime / timeFactor}`;
    return;
  }

  props.scriptEvent.time = eventTime.value * timeFactor;

  if (props.scriptEvent.moduleSubType === ModuleSubType.genericGpio) {
    props.scriptEvent.event = { setHigh: state.value === 1 };
  } else if (props.scriptEvent.moduleSubType === ModuleSubType.maestro) {
    props.scriptEvent.event = {
      channel: -1,
      isServo: false,
      position: state.value === 1 ? 2500 : 500,
      speed: 0,
      acceleration: 0,
    };
  }

  const response: ScriptEventModalResponse = {
    scriptEvent: props.scriptEvent,
    time: originalEventTime.value,
  };

  if (props.mode === 'edit') {
    emit('editEvent', response);
  } else {
    emit('addEvent', response);
  }
};

const removeEvent = () => {
  const response: ScriptEventModalResponse = {
    scriptEvent: props.scriptEvent,
    time: originalEventTime.value * timeFactor,
  };
  emit('removeEvent', response);
};

const closeModal = () => {
  emit('close');
};
</script>

<template>
  <dialog class="modal modal-open">
    <div class="modal-box w-100 max-w-md">
      <h1 class="text-2xl font-bold mb-4">GPIO Event</h1>

      <div class="py-4 flex flex-row">
        <div class="grow"></div>
        <div class="w-75">
          <div class="mb-2">
            <label
              for="time"
              class="block w-full mb-0.5 text-lg"
              >Event Time (seconds)</label
            >
            <input
              id="time"
              v-model.number="eventTime"
              type="number"
              step="0.1"
              placeholder="Time"
              class="input input-bordered w-full text-lg h-9"
            />
          </div>

          <div class="mb-2">
            <label
              for="state-select"
              class="block w-full mb-0.5 text-lg"
              >State</label
            >
            <select
              id="state-select"
              v-model.number="state"
              title="State"
              class="select select-bordered w-full text-2xl mt-2"
            >
              <option :value="0">Low</option>
              <option :value="1">High</option>
            </select>
          </div>

          <div
            v-if="errorMessage"
            class="text-center text-error text-lg"
          >
            {{ errorMessage }}
          </div>
        </div>
        <div class="grow"></div>
      </div>

      <div class="modal-action justify-center mt-5">
        <button
          class="btn btn-primary w-24 text-lg"
          data-testid="save-button"
          @click="addEvent"
        >
          Save
        </button>
        <button
          v-if="showRemoveButton"
          class="btn btn-error w-24 text-lg"
          data-testid="remove-button"
          @click="removeEvent"
        >
          Remove
        </button>
        <button
          class="btn w-24 text-lg"
          data-testid="close-button"
          @click="closeModal"
        >
          Close
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
