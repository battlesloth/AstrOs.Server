<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { HumanCyborgRelationsCmd, HcrCommandCategory } from '@/enums/scripts/humanCyborgRelations';
import {
  type HcrCommand,
  type HumanCyborgRelationsEvent,
  type ScriptEventModalResponse,
} from '@/models/scripts/scripting';
import type { ScriptEvent } from '@/models/scripts/scriptEvent';
import { HumanCyborgRelationsHelper } from '@/utils/humanCyborgRelationsHelper';
import { v4 as uuid } from 'uuid';

export type HumanCyborgModalMode = 'add' | 'edit';

interface HcrCommandListItem {
  id: HumanCyborgRelationsCmd;
  name: string;
}

const props = withDefaults(
  defineProps<{
    scriptEvent: ScriptEvent;
    mode?: HumanCyborgModalMode;
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
const eventTime = ref(0);
const originalEventTime = ref(0);
const errorMessage = ref('');
const commandCategory = ref<string>(HcrCommandCategory.stimuli.toString());
const command = ref<string>('');
const valueA = ref<string>('');
const valueB = ref<string>('');
const selectedCommands = ref<HcrCommand[]>([]);
const commands = ref<HcrCommandListItem[]>([]);

// Commands that have values
const hasValueA = [
  HumanCyborgRelationsCmd.minSecondsBetweenMusings,
  HumanCyborgRelationsCmd.maxSecondsBetweenMusings,
  HumanCyborgRelationsCmd.playWavOnA,
  HumanCyborgRelationsCmd.playWavOnB,
  HumanCyborgRelationsCmd.vocalizerVolume,
  HumanCyborgRelationsCmd.wavAVolume,
  HumanCyborgRelationsCmd.wavBVolume,
  HumanCyborgRelationsCmd.setHappyLevel,
  HumanCyborgRelationsCmd.setSadLevel,
  HumanCyborgRelationsCmd.setMadLevel,
  HumanCyborgRelationsCmd.setScaredLevel,
];

const hasValueB = [
  HumanCyborgRelationsCmd.playSdRandomOnA,
  HumanCyborgRelationsCmd.playSdRandomOnB,
];

const showRemoveButton = computed(() => props.mode === 'edit');

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

  const temp = props.scriptEvent.event as HumanCyborgRelationsEvent;
  if (temp !== undefined && temp.commands) {
    selectedCommands.value.push(...temp.commands);
  }

  originalEventTime.value = props.scriptEvent.time / timeFactor;
  eventTime.value = props.scriptEvent.time / timeFactor;
});

const hcrListItem = (cmd: HumanCyborgRelationsCmd): HcrCommandListItem => {
  return { id: cmd, name: HumanCyborgRelationsHelper.getCommandName(cmd) };
};

const setAvailableCommands = (category: HcrCommandCategory) => {
  commands.value = [];

  switch (category) {
    case HcrCommandCategory.stimuli:
      commands.value.push(
        hcrListItem(HumanCyborgRelationsCmd.MILD_HAPPY),
        hcrListItem(HumanCyborgRelationsCmd.extremeHappy),
        hcrListItem(HumanCyborgRelationsCmd.mildSad),
        hcrListItem(HumanCyborgRelationsCmd.extremeSad),
        hcrListItem(HumanCyborgRelationsCmd.mildAngry),
        hcrListItem(HumanCyborgRelationsCmd.extremeAngry),
        hcrListItem(HumanCyborgRelationsCmd.mildScared),
        hcrListItem(HumanCyborgRelationsCmd.extremeScared),
        hcrListItem(HumanCyborgRelationsCmd.overload),
      );
      break;
    case HcrCommandCategory.muse:
      commands.value.push(
        hcrListItem(HumanCyborgRelationsCmd.enableMuse),
        hcrListItem(HumanCyborgRelationsCmd.disableMuse),
        hcrListItem(HumanCyborgRelationsCmd.toggleMuse),
        hcrListItem(HumanCyborgRelationsCmd.triggerMusing),
        hcrListItem(HumanCyborgRelationsCmd.minSecondsBetweenMusings),
        hcrListItem(HumanCyborgRelationsCmd.maxSecondsBetweenMusings),
      );
      break;
    case HcrCommandCategory.sdWav:
      commands.value.push(
        hcrListItem(HumanCyborgRelationsCmd.playWavOnA),
        hcrListItem(HumanCyborgRelationsCmd.playWavOnB),
        hcrListItem(HumanCyborgRelationsCmd.playSdRandomOnA),
        hcrListItem(HumanCyborgRelationsCmd.playSdRandomOnB),
      );
      break;
    case HcrCommandCategory.stop:
      commands.value.push(
        hcrListItem(HumanCyborgRelationsCmd.panicStop),
        hcrListItem(HumanCyborgRelationsCmd.gracefulStop),
        hcrListItem(HumanCyborgRelationsCmd.stopWavOnA),
        hcrListItem(HumanCyborgRelationsCmd.stopWavOnB),
      );
      break;
    case HcrCommandCategory.volume:
      commands.value.push(
        hcrListItem(HumanCyborgRelationsCmd.vocalizerVolume),
        hcrListItem(HumanCyborgRelationsCmd.wavAVolume),
        hcrListItem(HumanCyborgRelationsCmd.wavBVolume),
      );
      break;
    case HcrCommandCategory.override:
      commands.value.push(
        hcrListItem(HumanCyborgRelationsCmd.enableImprov),
        hcrListItem(HumanCyborgRelationsCmd.enableCanonical),
        hcrListItem(HumanCyborgRelationsCmd.enablePersonalityOverride),
        hcrListItem(HumanCyborgRelationsCmd.disablePersonalityOverride),
        hcrListItem(HumanCyborgRelationsCmd.zeroEmotions),
        hcrListItem(HumanCyborgRelationsCmd.setHappyLevel),
        hcrListItem(HumanCyborgRelationsCmd.setSadLevel),
        hcrListItem(HumanCyborgRelationsCmd.setMadLevel),
        hcrListItem(HumanCyborgRelationsCmd.setScaredLevel),
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
    return `${HumanCyborgRelationsHelper.getCommandName(cmd.command)}: ${cmd.valueA} ${cmd.valueB}`;
  }

  if (hcrHasAValue(cmd.command)) {
    return `${HumanCyborgRelationsHelper.getCommandName(cmd.command)}: ${cmd.valueA}`;
  }

  return HumanCyborgRelationsHelper.getCommandName(cmd.command);
};

const addEvent = () => {
  if (eventTime.value > maxTime) {
    errorMessage.value = `Event time cannot be larger than ${maxTime / timeFactor}`;
    return;
  }

  props.scriptEvent.time = eventTime.value * timeFactor;

  const data = { commands: selectedCommands.value };
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
              <option :value="HcrCommandCategory.stimuli">Stimuli</option>
              <option :value="HcrCommandCategory.muse">Muse</option>
              <option :value="HcrCommandCategory.sdWav">SD Wav</option>
              <option :value="HcrCommandCategory.stop">Stop</option>
              <option :value="HcrCommandCategory.volume">Volume</option>
              <option :value="HcrCommandCategory.override">Override</option>
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
