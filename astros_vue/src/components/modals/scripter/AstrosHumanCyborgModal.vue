<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { HumanCyborgRelationsCmd, HcrCommandCategory, ModalMode } from '@/enums';
import type { HcrCommand, HumanCyborgRelationsEvent, ScriptEvent } from '@/models';

import { v4 as uuid } from 'uuid';
import { useHumanCyborgRelations } from '@/composables/useHumanCyborgRelations';

const { getHcrCommandName } = useHumanCyborgRelations();

interface HcrCommandListItem {
  id: HumanCyborgRelationsCmd;
  name: string;
}

const scriptEvent = defineModel<ScriptEvent>('scriptEvent', { required: true });

const props = withDefaults(
  defineProps<{
    mode?: ModalMode;
  }>(),
  {
    mode: ModalMode.ADD,
  },
);

const emit = defineEmits<{
  (e: 'save', originalTime: number): void;
  (e: 'remove', originalTime: number): void;
  (e: 'close'): void;
}>();

// Constants
const maxTime = 600;

// Local state
const eventTime = ref(0);
const originalEventTime = ref(0);
const originalTime = ref(0);
const originalEvent = ref<unknown>(null);
const errorMessage = ref('');
const commandCategory = ref<string>(HcrCommandCategory.STIMULI.toString());
const command = ref<string>('');
const valueA = ref<string>('');
const valueB = ref<string>('');
const selectedCommands = ref<HcrCommand[]>([]);
const commands = ref<HcrCommandListItem[]>([]);

// Commands that have values
const hasValueA = [
  HumanCyborgRelationsCmd.MIN_SECONDS_BETWEEN_MUSINGS,
  HumanCyborgRelationsCmd.MAX_SECONDS_BETWEEN_MUSINGS,
  HumanCyborgRelationsCmd.PLAY_WAV_ON_A,
  HumanCyborgRelationsCmd.PLAY_WAV_ON_B,
  HumanCyborgRelationsCmd.VOCALIZER_VOLUME,
  HumanCyborgRelationsCmd.WAV_A_VOLUME,
  HumanCyborgRelationsCmd.WAV_B_VOLUME,
  HumanCyborgRelationsCmd.SET_HAPPY_LEVEL,
  HumanCyborgRelationsCmd.SET_SAD_LEVEL,
  HumanCyborgRelationsCmd.SET_MAD_LEVEL,
  HumanCyborgRelationsCmd.SET_SCARED_LEVEL,
];

const hasValueB = [
  HumanCyborgRelationsCmd.PLAY_SD_RANDOM_ON_A,
  HumanCyborgRelationsCmd.PLAY_SD_RANDOM_ON_B,
];

const showRemoveButton = computed(() => props.mode === ModalMode.EDIT);

const valueADisabled = computed(() => {
  const cmdNum = Number(command.value);
  return !hcrHasAValue(cmdNum) && !hcrHasBValue(cmdNum);
});

const valueBDisabled = computed(() => {
  const cmdNum = Number(command.value);
  return !hcrHasBValue(cmdNum);
});

onMounted(() => {
  setAvailableCommands(Number(commandCategory.value));

  // Store original state for reverting
  originalTime.value = scriptEvent.value.time;
  originalEvent.value = JSON.parse(JSON.stringify(scriptEvent.value.event));

  const temp = scriptEvent.value.event as HumanCyborgRelationsEvent;
  if (temp !== undefined && temp.commands) {
    selectedCommands.value.push(...temp.commands);
  }

  originalEventTime.value = scriptEvent.value.time;
  eventTime.value = scriptEvent.value.time;
});

const hcrListItem = (cmd: HumanCyborgRelationsCmd): HcrCommandListItem => {
  return { id: cmd, name: getHcrCommandName(cmd) };
};

const setAvailableCommands = (category: HcrCommandCategory) => {
  commands.value = [];

  switch (category) {
    case HcrCommandCategory.STIMULI:
      commands.value.push(
        hcrListItem(HumanCyborgRelationsCmd.MILD_HAPPY),
        hcrListItem(HumanCyborgRelationsCmd.EXTREME_HAPPY),
        hcrListItem(HumanCyborgRelationsCmd.MILD_SAD),
        hcrListItem(HumanCyborgRelationsCmd.EXTREME_SAD),
        hcrListItem(HumanCyborgRelationsCmd.MILD_ANGRY),
        hcrListItem(HumanCyborgRelationsCmd.EXTREME_ANGRY),
        hcrListItem(HumanCyborgRelationsCmd.MILD_SCARED),
        hcrListItem(HumanCyborgRelationsCmd.EXTREME_SCARED),
        hcrListItem(HumanCyborgRelationsCmd.OVERLOAD),
      );
      break;
    case HcrCommandCategory.MUSE:
      commands.value.push(
        hcrListItem(HumanCyborgRelationsCmd.ENABLE_MUSE),
        hcrListItem(HumanCyborgRelationsCmd.DISABLE_MUSE),
        hcrListItem(HumanCyborgRelationsCmd.TOGGLE_MUSE),
        hcrListItem(HumanCyborgRelationsCmd.TRIGGER_MUSING),
        hcrListItem(HumanCyborgRelationsCmd.MIN_SECONDS_BETWEEN_MUSINGS),
        hcrListItem(HumanCyborgRelationsCmd.MAX_SECONDS_BETWEEN_MUSINGS),
      );
      break;
    case HcrCommandCategory.SD_WAV:
      commands.value.push(
        hcrListItem(HumanCyborgRelationsCmd.PLAY_WAV_ON_A),
        hcrListItem(HumanCyborgRelationsCmd.PLAY_WAV_ON_B),
        hcrListItem(HumanCyborgRelationsCmd.PLAY_SD_RANDOM_ON_A),
        hcrListItem(HumanCyborgRelationsCmd.PLAY_SD_RANDOM_ON_B),
      );
      break;
    case HcrCommandCategory.STOP:
      commands.value.push(
        hcrListItem(HumanCyborgRelationsCmd.PANIC_STOP),
        hcrListItem(HumanCyborgRelationsCmd.GRACEFUL_STOP),
        hcrListItem(HumanCyborgRelationsCmd.STOP_WAV_ON_A),
        hcrListItem(HumanCyborgRelationsCmd.STOP_WAV_ON_B),
      );
      break;
    case HcrCommandCategory.VOLUME:
      commands.value.push(
        hcrListItem(HumanCyborgRelationsCmd.VOCALIZER_VOLUME),
        hcrListItem(HumanCyborgRelationsCmd.WAV_A_VOLUME),
        hcrListItem(HumanCyborgRelationsCmd.WAV_B_VOLUME),
      );
      break;
    case HcrCommandCategory.OVERRIDE:
      commands.value.push(
        hcrListItem(HumanCyborgRelationsCmd.ENABLE_IMPROV),
        hcrListItem(HumanCyborgRelationsCmd.ENABLE_CANONICAL),
        hcrListItem(HumanCyborgRelationsCmd.ENABLE_PERSONALITY_OVERRIDE),
        hcrListItem(HumanCyborgRelationsCmd.DISABLE_PERSONALITY_OVERRIDE),
        hcrListItem(HumanCyborgRelationsCmd.ZERO_EMOTIONS),
        hcrListItem(HumanCyborgRelationsCmd.SET_HAPPY_LEVEL),
        hcrListItem(HumanCyborgRelationsCmd.SET_SAD_LEVEL),
        hcrListItem(HumanCyborgRelationsCmd.SET_MAD_LEVEL),
        hcrListItem(HumanCyborgRelationsCmd.SET_SCARED_LEVEL),
      );
      break;
  }

  if (commands.value.length > 0) {
    command.value = commands.value[0]?.id.toString() ?? '';
  }
};

const categoryChange = () => {
  errorMessage.value = '';
  setAvailableCommands(Number(commandCategory.value));
};

const commandChange = () => {
  errorMessage.value = '';
};

const hcrHasBValue = (cmd: HumanCyborgRelationsCmd): boolean => {
  return hasValueB.find((x) => x === cmd) !== undefined;
};

const hcrHasAValue = (cmd: HumanCyborgRelationsCmd): boolean => {
  return hasValueA.find((x) => x === cmd) !== undefined;
};

const addCommand = () => {
  const cmdNum = Number(command.value);
  let missingA = false;
  let missingB = false;

  if (hcrHasBValue(cmdNum)) {
    if (!valueA.value) {
      missingA = true;
    }
    if (!valueB.value) {
      missingB = true;
    }
  }

  if (hcrHasAValue(cmdNum)) {
    if (!valueA.value) {
      missingA = true;
    }
  }

  if (missingA || missingB) {
    errorMessage.value = `Required Values Missing: ${missingA ? 'A' : ''}${
      missingA && missingB ? ',' : ''
    }${missingB ? 'B' : ''}`;
    return;
  }

  selectedCommands.value.push({
    id: uuid(),
    category: Number(commandCategory.value),
    command: cmdNum,
    valueA: Number(valueA.value) || 0,
    valueB: Number(valueB.value) || 0,
  });

  // Clear input values after adding
  valueA.value = '';
  valueB.value = '';
};

const removeCommand = (id: string) => {
  const cmdIdx = selectedCommands.value.findIndex((x) => x.id === id);
  if (cmdIdx !== undefined && cmdIdx > -1) {
    selectedCommands.value.splice(cmdIdx, 1);
  }
};

const formatSelectedCommand = (cmd: HcrCommand): string => {
  if (hcrHasBValue(cmd.command)) {
    return `${getHcrCommandName(cmd.command)}: ${cmd.valueA} ${cmd.valueB}`;
  }

  if (hcrHasAValue(cmd.command)) {
    return `${getHcrCommandName(cmd.command)}: ${cmd.valueA}`;
  }

  return getHcrCommandName(cmd.command);
};

const addEvent = () => {
  if (eventTime.value > maxTime) {
    errorMessage.value = `Event time cannot be larger than ${maxTime} seconds`;
    return;
  }

  scriptEvent.value.time = eventTime.value;

  const data = { commands: selectedCommands.value };
  scriptEvent.value.event = data;

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
  <dialog class="modal modal-open">
    <div class="modal-box w-100 max-w-md">
      <h1 class="text-2xl font-bold mb-4">Human Cyborg Relations Event</h1>

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

          <!-- Command list -->
          <div class="border border-base-300 w-full h-20 overflow-auto mb-2">
            <ul class="list-none p-0 m-0">
              <li
                v-for="cmd in selectedCommands"
                :key="cmd.id"
                class="flex flex-row items-center"
              >
                <div class="grow whitespace-nowrap overflow-hidden text-ellipsis">
                  {{ formatSelectedCommand(cmd) }}
                </div>
                <button
                  class="btn btn-ghost btn-xs mx-1"
                  title="remove"
                  @click="removeCommand(cmd.id)"
                >
                  ✕
                </button>
              </li>
            </ul>
          </div>

          <div class="divider my-2"></div>

          <!-- Command Category -->
          <div class="mb-2">
            <label
              for="commandCategory"
              class="block w-full mb-0.5 text-lg font-medium"
              >Command Category</label
            >
            <select
              id="commandCategory"
              v-model="commandCategory"
              title="Command Category"
              class="select select-bordered w-full text-lg mt-2"
              @change="categoryChange"
            >
              <option :value="HcrCommandCategory.STIMULI">Stimuli</option>
              <option :value="HcrCommandCategory.MUSE">Muse</option>
              <option :value="HcrCommandCategory.SD_WAV">SD Wav</option>
              <option :value="HcrCommandCategory.STOP">Stop</option>
              <option :value="HcrCommandCategory.VOLUME">Volume</option>
              <option :value="HcrCommandCategory.OVERRIDE">Override</option>
            </select>
          </div>

          <!-- Command -->
          <div class="mb-2">
            <label
              for="command"
              class="block w-full mb-0.5 text-lg font-medium"
              >Command</label
            >
            <select
              id="command"
              v-model="command"
              title="Command"
              class="select select-bordered w-full text-lg mt-2"
              @change="commandChange"
            >
              <option
                v-for="cmd in commands"
                :key="cmd.id"
                :value="cmd.id"
              >
                {{ cmd.name }}
              </option>
            </select>
          </div>

          <!-- Value A -->
          <div class="mb-2">
            <label
              for="value-a"
              class="block w-full mb-0.5 text-lg"
              >Value A</label
            >
            <input
              id="value-a"
              v-model="valueA"
              type="number"
              step="1"
              placeholder="Value A"
              :disabled="valueADisabled"
              class="input input-bordered w-full text-lg h-9"
            />
          </div>

          <!-- Value B -->
          <div class="mb-2">
            <label
              for="value-b"
              class="block w-full mb-0.5 text-lg"
              >Value B</label
            >
            <input
              id="value-b"
              v-model="valueB"
              type="number"
              step="1"
              placeholder="Value B"
              :disabled="valueBDisabled"
              class="input input-bordered w-full text-lg h-9"
            />
          </div>

          <!-- Add Command Button -->
          <div class="flex justify-center mt-1 mb-2">
            <button
              class="btn btn-sm btn-primary h-7 text-lg w-15 px-0"
              @click="addCommand"
            >
              Add
            </button>
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
