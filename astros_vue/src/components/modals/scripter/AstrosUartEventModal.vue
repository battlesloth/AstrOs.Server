<script setup lang="ts">
import { ref } from 'vue';
import { type GenericSerialEvent } from '@/models';
import type { ScriptEvent } from '@/models/scripts/scriptEvent';
import { ModalMode } from '@/enums';

const scriptEvent = defineModel<ScriptEvent>('scriptEvent', { required: true });

export interface UartEventModalProps {
  mode?: ModalMode;
  maxTime?: number;
}

const props = withDefaults(defineProps<UartEventModalProps>(), {
  mode: ModalMode.ADD,
  maxTime: 600,
});

const emit = defineEmits<{
  (e: 'save', originalTime: number): void;
  (e: 'remove', originalTime: number): void;
  (e: 'close'): void;
}>();

const originalEventTime = ref(0);
const originalTime = ref(0);
const originalEvent = ref<unknown>(null);
const eventTime = ref(0);
const eventValue = ref('');
const errorMessage = ref('');

// Initialize values from scriptEvent
const initializeValues = () => {
  // Store original state for reverting
  originalTime.value = scriptEvent.value.time;
  originalEvent.value = JSON.parse(JSON.stringify(scriptEvent.value.event));

  if (scriptEvent.value.event !== undefined) {
    const temp = scriptEvent.value.event as GenericSerialEvent;
    eventValue.value = temp.value;
  }

  originalEventTime.value = scriptEvent.value.time;
  eventTime.value = scriptEvent.value.time;
};

initializeValues();

const saveEvent = () => {
  errorMessage.value = '';

  if (+eventTime.value > props.maxTime) {
    errorMessage.value = `Event time cannot be larger than ${props.maxTime} seconds`;
    return;
  }

  scriptEvent.value.time = +eventTime.value;
  scriptEvent.value.event = { value: eventValue.value };

  emit('save', originalEventTime.value);
};

const removeEvent = () => {
  emit('remove', originalEventTime.value);
};

const closeModal = () => {
  // Revert changes if in edit mode
  if (props.mode === ModalMode.EDIT) {
    scriptEvent.value.time = originalTime.value;
    scriptEvent.value.event = JSON.parse(JSON.stringify(originalEvent.value));
  }
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
