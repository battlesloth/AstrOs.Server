<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { KangarooAction, ModalMode } from '@/enums';
import type { KangarooEvent, KangarooX2, ScriptEventModalResponse, ScriptEvent } from '@/models';

const props = withDefaults(
  defineProps<{
    scriptEvent: ScriptEvent;
    kangaroo: KangarooX2;
    mode?: ModalMode;
  }>(),
  {
    mode: ModalMode.ADD,
  },
);

const emit = defineEmits<{
  (e: 'addEvent', response: ScriptEventModalResponse): void;
  (e: 'editEvent', response: ScriptEventModalResponse): void;
  (e: 'removeEvent', response: ScriptEventModalResponse): void;
  (e: 'close'): void;
}>();

// Constants
const maxTime = 600;

// Local state
const eventTime = ref(0);
const originalEventTime = ref(0);
const errorMessage = ref('');

const ch1Action = ref<string>('0');
const ch1Speed = ref<number>();
const ch1Position = ref<number>();

const ch2Action = ref<string>('0');
const ch2Speed = ref<number>();
const ch2Position = ref<number>();

const showRemoveButton = computed(() => props.mode === ModalMode.EDIT);

const ch1SpdDisabled = computed(() => {
  const action = Number(ch1Action.value);
  return action !== KangarooAction.SPEED && action !== KangarooAction.POSITION;
});

const ch1PosDisabled = computed(() => {
  const action = Number(ch1Action.value);
  return action !== KangarooAction.POSITION;
});

const ch2SpdDisabled = computed(() => {
  const action = Number(ch2Action.value);
  return action !== KangarooAction.SPEED && action !== KangarooAction.POSITION;
});

const ch2PosDisabled = computed(() => {
  const action = Number(ch2Action.value);
  return action !== KangarooAction.POSITION;
});

// Watch for changes to clear disabled values
watch(ch1Action, (newAction) => {
  const action = Number(newAction);
  if (action !== KangarooAction.SPEED && action !== KangarooAction.POSITION) {
    ch1Speed.value = undefined;
  }
  if (action !== KangarooAction.POSITION) {
    ch1Position.value = undefined;
  }
});

watch(ch2Action, (newAction) => {
  const action = Number(newAction);
  if (action !== KangarooAction.SPEED && action !== KangarooAction.POSITION) {
    ch2Speed.value = undefined;
  }
  if (action !== KangarooAction.POSITION) {
    ch2Position.value = undefined;
  }
});

onMounted(() => {
  const temp = props.scriptEvent.event as KangarooEvent;

  if (temp !== undefined) {
    ch1Action.value = temp.ch1Action.toString();
    ch1Speed.value = temp.ch1Speed;
    ch1Position.value = temp.ch1Position;

    ch2Action.value = temp.ch2Action.toString();
    ch2Speed.value = temp.ch2Speed;
    ch2Position.value = temp.ch2Position;
  }

  originalEventTime.value = props.scriptEvent.time;
  eventTime.value = props.scriptEvent.time;
});

const addEvent = () => {
  if (eventTime.value > maxTime) {
    errorMessage.value = `Event time cannot be larger than ${maxTime} seconds`;
    return;
  }

  props.scriptEvent.time = eventTime.value;

  const data: KangarooEvent = {
    ch1Action: Number(ch1Action.value),
    ch1Speed: ch1Speed.value ?? 0,
    ch1Position: ch1Position.value ?? 0,
    ch2Action: Number(ch2Action.value),
    ch2Speed: ch2Speed.value ?? 0,
    ch2Position: ch2Position.value ?? 0,
  };

  props.scriptEvent.event = data;

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
    time: originalEventTime.value,
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
      <h1 class="text-2xl font-bold mb-4">Kangaroo Event</h1>

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

          <div class="divider my-2"></div>

          <!-- Channel 1 -->
          <div class="mb-2">
            <label
              for="ch1select"
              class="block w-full mb-0.5 text-xl font-medium"
            >
              {{ kangaroo.ch1Name }}
            </label>
            <select
              id="ch1select"
              v-model="ch1Action"
              title="channel 1"
              class="select select-bordered w-full text-lg mt-2"
            >
              <option value="0">None</option>
              <option value="1">Start</option>
              <option value="2">Home</option>
              <option value="3">Speed</option>
              <option value="4">Position</option>
            </select>
          </div>

          <div class="mb-2 flex gap-4">
            <div class="flex-1">
              <label
                for="ch1spd"
                class="block mb-0.5 text-lg"
                >Speed</label
              >
              <input
                id="ch1spd"
                v-model.number="ch1Speed"
                type="number"
                placeholder="Speed"
                :disabled="ch1SpdDisabled"
                class="input input-bordered w-full text-lg h-9"
              />
            </div>
            <div class="flex-1">
              <label
                for="ch1pos"
                class="block mb-0.5 text-lg"
                >Position</label
              >
              <input
                id="ch1pos"
                v-model.number="ch1Position"
                type="number"
                placeholder="Position"
                :disabled="ch1PosDisabled"
                class="input input-bordered w-full text-lg h-9"
              />
            </div>
          </div>

          <div class="divider my-2"></div>

          <!-- Channel 2 -->
          <div class="mb-2">
            <label
              for="ch2select"
              class="block w-full mb-0.5 text-xl font-medium"
            >
              {{ kangaroo.ch2Name }}
            </label>
            <select
              id="ch2select"
              v-model="ch2Action"
              title="channel 2"
              class="select select-bordered w-full text-lg mt-2"
            >
              <option value="0">None</option>
              <option value="1">Start</option>
              <option value="2">Home</option>
              <option value="3">Speed</option>
              <option value="4">Position</option>
            </select>
          </div>

          <div class="mb-2 flex gap-4">
            <div class="flex-1">
              <label
                for="ch2spd"
                class="block mb-0.5 text-lg"
                >Speed</label
              >
              <input
                id="ch2spd"
                v-model.number="ch2Speed"
                type="number"
                placeholder="Speed"
                :disabled="ch2SpdDisabled"
                class="input input-bordered w-full text-lg h-9"
              />
            </div>
            <div class="flex-1">
              <label
                for="ch2pos"
                class="block mb-0.5 text-lg"
                >Position</label
              >
              <input
                id="ch2pos"
                v-model.number="ch2Position"
                type="number"
                placeholder="Position"
                :disabled="ch2PosDisabled"
                class="input input-bordered w-full text-lg h-9"
              />
            </div>
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
