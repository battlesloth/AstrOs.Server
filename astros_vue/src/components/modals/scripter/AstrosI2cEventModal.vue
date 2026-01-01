<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { type I2cEvent, type ScriptEventModalResponse, type ScriptEvent } from '@/models';
import { ModalMode } from '@/enums';

const props = withDefaults(
  defineProps<{
    scriptEvent: ScriptEvent;
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
const message = ref('');
const errorMessage = ref('');

const showRemoveButton = computed(() => props.mode === ModalMode.EDIT);

onMounted(() => {
  const temp = props.scriptEvent.event as I2cEvent;

  if (temp !== undefined) {
    message.value = temp.message;
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
  props.scriptEvent.event = { message: message.value };

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
      <h1 class="text-2xl font-bold mb-4">I2C Event</h1>

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
              for="value"
              class="block w-full mb-0.5 text-lg"
              >I2C Message</label
            >
            <input
              id="value"
              v-model="message"
              type="text"
              placeholder="Value"
              class="input input-bordered w-full text-lg h-9"
            />
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
