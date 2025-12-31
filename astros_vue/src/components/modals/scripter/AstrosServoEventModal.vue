<script setup lang="ts">
import { ref } from 'vue';
import { type MaestroEvent } from '@/models/scripts/scripting';
import type { ScriptEvent } from '@/models/scripts/scriptEvent';
import { ModuleSubType } from '@/enums/modules/ModuleSubType';

export interface ServoEventModalProps {
  mode?: 'add' | 'edit';
  scriptEvent: ScriptEvent;
  timeFactor?: number;
  maxTime?: number;
}

const props = withDefaults(defineProps<ServoEventModalProps>(), {
  mode: 'add',
  timeFactor: 1000,
  maxTime: 600000,
});

const emit = defineEmits<{
  addEvent: [data: { scriptEvent: ScriptEvent; time: number }];
  editEvent: [data: { scriptEvent: ScriptEvent; time: number }];
  removeEvent: [];
  close: [];
}>();

const originalEventTime = ref(0);
const eventTime = ref(0);
const speed = ref(1);
const position = ref(0);
const acceleration = ref(0);
const errorMessage = ref('');

// Initialize values from scriptEvent
const initializeValues = () => {
  if (props.scriptEvent.event === undefined) {
    position.value = 0;
    speed.value = 0;
    acceleration.value = 0;
  } else if (props.scriptEvent.moduleSubType === ModuleSubType.MAESTRO) {
    const temp = props.scriptEvent.event as MaestroEvent;
    position.value = temp.position;
    speed.value = temp.speed;
    acceleration.value = temp.acceleration;
  }

  originalEventTime.value = props.scriptEvent.time / props.timeFactor;
  eventTime.value = props.scriptEvent.time / props.timeFactor;
};

initializeValues();

// Validate position (-1 to 100)
const validatePosition = () => {
  if (position.value < -1) position.value = -1;
  if (position.value > 100) position.value = 100;
};

// Validate speed (0 to 255)
const validateSpeed = () => {
  if (speed.value < 0) speed.value = 0;
  if (speed.value > 255) speed.value = 255;
};

// Validate acceleration (0 to 255)
const validateAcceleration = () => {
  if (acceleration.value < 0) acceleration.value = 0;
  if (acceleration.value > 255) acceleration.value = 255;
};

const saveEvent = () => {
  errorMessage.value = '';

  if (+eventTime.value > props.maxTime) {
    errorMessage.value = `Event time cannot be larger than ${props.maxTime / props.timeFactor}`;
    return;
  }

  props.scriptEvent.time = +eventTime.value * props.timeFactor;

  if (props.scriptEvent.moduleSubType === ModuleSubType.MAESTRO) {
    const data: MaestroEvent = {
      // channel will be set when persisting the event to the DB
      channel: -1,
      isServo: true,
      position: position.value,
      speed: speed.value,
      acceleration: acceleration.value,
    };

    props.scriptEvent.event = data;
  }

  const eventData = {
    scriptEvent: props.scriptEvent,
    time: originalEventTime.value * props.timeFactor,
  };

  if (props.mode === 'add') {
    emit('addEvent', eventData);
  } else {
    emit('editEvent', eventData);
  }
};

const removeEvent = () => {
  emit('removeEvent');
};

const closeModal = () => {
  emit('close');
};
</script>

<template>
  <div class="modal modal-open">
    <div class="modal-box max-w-md">
      <h3 class="text-lg font-bold mb-4">Servo Event</h3>

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
            for="position"
            class="label"
          >
            <span class="label-text">Position (0 to 100%, -1 for Home)</span>
          </label>
          <input
            id="position"
            v-model.number="position"
            type="number"
            min="-1"
            max="100"
            placeholder="Position"
            class="input input-bordered w-full"
            @change="validatePosition"
          />
        </div>

        <div>
          <label
            for="speed"
            class="label"
          >
            <span class="label-text">Speed (0 to 255, 0 is unlimited)</span>
          </label>
          <input
            id="speed"
            v-model.number="speed"
            type="number"
            min="0"
            max="255"
            placeholder="Speed"
            class="input input-bordered w-full"
            @change="validateSpeed"
          />
        </div>

        <div>
          <label
            for="acceleration"
            class="label"
          >
            <span class="label-text">Accel. (0 to 255, 0 is unlimited)</span>
          </label>
          <input
            id="acceleration"
            v-model.number="acceleration"
            type="number"
            min="0"
            max="255"
            placeholder="Acceleration"
            class="input input-bordered w-full"
            @change="validateAcceleration"
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
          v-if="mode === 'edit'"
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
