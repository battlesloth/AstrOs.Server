<script setup lang="ts">
import { ref } from 'vue';
import { type GenericSerialEvent, type ScriptEventModalResponse } from '@/models';
import type { ScriptEvent } from '@/models/scripts/scriptEvent';
import { ModalMode } from '@/enums';

export interface UartEventModalProps {
  mode?: ModalMode;
  scriptEvent: ScriptEvent;
  maxTime?: number;
}

const props = withDefaults(defineProps<UartEventModalProps>(), {
  mode: ModalMode.ADD,
  maxTime: 600,
});

const emit = defineEmits<{
  (e: 'addEvent', data: ScriptEventModalResponse): void;
  (e: 'editEvent', data: ScriptEventModalResponse): void;
  (e: 'removeEvent', data: ScriptEventModalResponse): void;
  (e: 'close'): void;
}>();

const originalEventTime = ref(0);
const eventTime = ref(0);
const eventValue = ref('');
const errorMessage = ref('');

// Initialize values from scriptEvent
const initializeValues = () => {
  if (props.scriptEvent.event !== undefined) {
    const temp = props.scriptEvent.event as GenericSerialEvent;
    eventValue.value = temp.value;
  }

  originalEventTime.value = props.scriptEvent.time;
  eventTime.value = props.scriptEvent.time;
};

initializeValues();

const saveEvent = () => {
  errorMessage.value = '';

  if (+eventTime.value > props.maxTime) {
    errorMessage.value = `Event time cannot be larger than ${props.maxTime} seconds`;
    return;
  }

  props.scriptEvent.time = +eventTime.value;
  props.scriptEvent.event = { value: eventValue.value };

  const eventData: ScriptEventModalResponse = {
    scriptEvent: props.scriptEvent,
    time: originalEventTime.value,
  };

  if (props.mode === ModalMode.ADD) {
    emit('addEvent', eventData);
  } else {
    emit('editEvent', eventData);
  }
};

const removeEvent = () => {
  const eventData: ScriptEventModalResponse = {
    scriptEvent: props.scriptEvent,
    time: originalEventTime.value,
  };
  emit('removeEvent', eventData);
};

const closeModal = () => {
  emit('close');
};
</script>

<template>
  <div class="modal modal-open">
    <div class="modal-box max-w-md">
      <h3 class="text-lg font-bold mb-4">Serial Event</h3>

      <div class="space-y-4">
        <div>
          <label
            for="time"
            class="label"
          >
            <span class="label-text">Event Time (seconds)</span>
          </label>
          <input
            id="time"
            v-model.number="eventTime"
            type="number"
            step="0.1"
            placeholder="Time"
            class="input input-bordered w-full"
          />
        </div>

        <div>
          <label
            for="value"
            class="label"
          >
            <span class="label-text">Serial Command</span>
          </label>
          <input
            id="value"
            v-model="eventValue"
            type="text"
            placeholder="Value"
            class="input input-bordered w-full"
          />
        </div>

        <div
          v-if="errorMessage"
          class="text-error text-sm"
        >
          {{ errorMessage }}
        </div>
      </div>

      <div class="modal-action">
        <button
          class="btn btn-primary"
          @click="saveEvent"
        >
          Save
        </button>
        <button
          v-if="mode === ModalMode.EDIT"
          class="btn btn-error"
          @click="removeEvent"
        >
          Remove
        </button>
        <button
          class="btn"
          @click="closeModal"
        >
          Close
        </button>
      </div>
    </div>
  </div>
</template>
