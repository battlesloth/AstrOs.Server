<script setup lang="ts">
import { ref, computed } from 'vue'
import { type GenericSerialEvent, type ScriptEvent } from '@/models/scripts/scripting'

export interface UartEventModalProps {
  mode?: 'add' | 'edit'
  scriptEvent: ScriptEvent
  timeFactor?: number
  maxTime?: number
}

const props = withDefaults(defineProps<UartEventModalProps>(), {
  mode: 'add',
  timeFactor: 1000,
  maxTime: 600000,
})

const emit = defineEmits<{
  addEvent: [data: { scriptEvent: ScriptEvent; time: number }]
  editEvent: [data: { scriptEvent: ScriptEvent; time: number }]
  removeEvent: []
  close: []
}>()

const originalEventTime = ref(0)
const eventTime = ref(0)
const eventValue = ref('')
const errorMessage = ref('')

// Initialize values from scriptEvent
const initializeValues = () => {
  if (props.scriptEvent.event !== undefined) {
    const temp = props.scriptEvent.event as GenericSerialEvent
    eventValue.value = temp.value
  }

  originalEventTime.value = props.scriptEvent.time / props.timeFactor
  eventTime.value = props.scriptEvent.time / props.timeFactor
}

initializeValues()

const saveEvent = () => {
  errorMessage.value = ''

  if (+eventTime.value > props.maxTime) {
    errorMessage.value = `Event time cannot be larger than ${props.maxTime / props.timeFactor}`
    return;
  }

  props.scriptEvent.time = +eventTime.value * props.timeFactor;
  props.scriptEvent.event = { value: eventValue.value };

  const eventData = {
    scriptEvent: props.scriptEvent,
    time: originalEventTime.value * props.timeFactor,
  }

  if (props.mode === 'add') {
    emit('addEvent', eventData)
  } else {
    emit('editEvent', eventData)
  }
}

const removeEvent = () => {
  emit('removeEvent')
}

const closeModal = () => {
  emit('close')
}
</script>

<template>
  <div class="modal modal-open">
    <div class="modal-box max-w-md">
      <h3 class="text-lg font-bold mb-4">Serial Event</h3>

      <div class="space-y-4">
        <div>
          <label for="time" class="label">
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
          <label for="value" class="label">
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

        <div v-if="errorMessage" class="text-error text-sm">
          {{ errorMessage }}
        </div>
      </div>

      <div class="modal-action">
        <button class="btn btn-primary" @click="saveEvent">Save</button>
        <button v-if="mode === 'edit'" class="btn btn-error" @click="removeEvent">Remove</button>
        <button class="btn" @click="closeModal">Close</button>
      </div>
    </div>
  </div>
</template>
