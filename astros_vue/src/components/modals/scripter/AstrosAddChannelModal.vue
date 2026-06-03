<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import { ScriptChannelType } from '@/enums/scripts/scriptChannelType';
import type { LocationDetails, ChannelDetails, AddChannelModalResponse } from '@/models';
import { useScripterStore } from '@/stores/scripter';
import { useI18n } from 'vue-i18n';

interface ScriptChannelTypeOption {
  id: ScriptChannelType;
  name: string;
}

const scripterStore = useScripterStore();
const { t } = useI18n();

const emit = defineEmits<{
  (e: 'addChannel', response: AddChannelModalResponse): void;
  (e: 'close'): void;
}>();

// Local state
const errorMessage = ref('');
const selectedController = ref('_any_');
const controllers = ref<LocationDetails[]>([]);
const channels = ref<Map<ScriptChannelType, ChannelDetails[]>>(new Map());
const selectedChannelType = ref<ScriptChannelType>(ScriptChannelType.NONE);
const selectedChannels = ref<string[]>([]);

// Channel type options
const channelTypes: ScriptChannelTypeOption[] = [
  { id: ScriptChannelType.NONE, name: t('modals.add_channel.any_channel_type') },
  { id: ScriptChannelType.AUDIO, name: t('modals.add_channel.audio_channels') },
  { id: ScriptChannelType.GPIO, name: t('modals.add_channel.gpio_channels') },
  { id: ScriptChannelType.GENERIC_I2C, name: t('modals.add_channel.i2c_channels') },
  { id: ScriptChannelType.KANGAROO, name: t('modals.add_channel.kangaroo_channels') },
  { id: ScriptChannelType.GENERIC_UART, name: t('modals.add_channel.serial_channels') },
  { id: ScriptChannelType.SERVO, name: t('modals.add_channel.servo_channels') },
];

// Computed controllers with "Any Controller" option
const controllersWithAny = computed(() => {
  const anyController: LocationDetails = {
    id: '_any_',
    name: 'Any Controller',
    assigned: true,
  };
  return [anyController, ...controllers.value];
});

// Filter available channels based on selections
const filteredChannels = computed(() => {
  let result: ChannelDetails[] = [];

  const type = selectedChannelType.value;

  if (type !== ScriptChannelType.NONE) {
    const temp = channels.value.get(type);
    if (temp) {
      result = [...temp];
    }
  } else {
    // Get all channels from all types
    for (const channelList of channels.value.values()) {
      result.push(...channelList);
    }
  }

  // Filter by selected controller
  if (selectedController.value !== '_any_') {
    result = result.filter((x) => x.locationId === selectedController.value);
  }

  // Sort by name
  return result.sort((a, b) => a.name.localeCompare(b.name));
});

// Watch for changes to reset selection
watch([selectedController, selectedChannelType], () => {
  selectedChannels.value = [];
});

const addChannel = () => {
  const toAdd = new Map<ScriptChannelType, ChannelDetails[]>();

  for (const channelId of selectedChannels.value) {
    const channelDetails = filteredChannels.value.find((x) => x.id === channelId);

    if (channelDetails) {
      if (!toAdd.has(channelDetails.scriptChannelType)) {
        toAdd.set(channelDetails.scriptChannelType, []);
      }

      toAdd.get(channelDetails.scriptChannelType)?.push(channelDetails);
    }
  }

  emit('addChannel', { channels: toAdd });
  clearOptions();
};

const closeModal = () => {
  clearOptions();
  emit('close');
};

const clearOptions = () => {
  selectedController.value = '_any_';
  selectedChannelType.value = ScriptChannelType.NONE;
  selectedChannels.value = [];
  errorMessage.value = '';
};

onMounted(() => {
  controllers.value = scripterStore.getLocationDetailsList();
  channels.value = scripterStore.getChannelDetailsMap();
});
</script>

<template>
  <dialog class="modal modal-open">
    <div class="modal-box w-100 max-w-md">
      <h1 class="text-2xl font-bold mb-4">{{ $t('modals.add_channel.title') }}</h1>
      <div class="py-4">
        <select
          id="controller-select"
          v-model="selectedController"
          :aria-label="$t('modals.add_channel.controller')"
          class="select select-bordered w-full text-2xl mb-5"
        >
          <option
            v-for="c in controllersWithAny"
            :key="c.id"
            :value="c.id"
          >
            {{ c.name }}
          </option>
        </select>

        <select
          id="module-select"
          v-model="selectedChannelType"
          :aria-label="$t('modals.add_channel.channel_type')"
          class="select select-bordered w-full text-2xl mb-5"
        >
          <option
            v-for="ch in channelTypes"
            :key="ch.id"
            :value="ch.id"
          >
            {{ ch.name }}
          </option>
        </select>

        <select
          id="channel-select"
          v-model="selectedChannels"
          :aria-label="$t('modals.add_channel.select_channel')"
          multiple
          class="select select-bordered w-full text-2xl mb-5 min-h-50"
        >
          <option
            value="-1"
            disabled
          >
            {{ $t('modals.add_channel.select_channel') }}
          </option>
          <option
            v-for="ch in filteredChannels"
            :key="ch.id"
            :value="ch.id"
            :disabled="!ch.available"
          >
            {{ ch.name }}
          </option>
        </select>

        <div
          v-if="errorMessage"
          class="text-center text-error text-lg"
        >
          {{ errorMessage }}
        </div>
      </div>

      <div class="modal-action justify-center">
        <button
          class="btn btn-primary w-24 text-lg"
          data-testid="add-channel-button"
          @click="addChannel"
        >
          {{ $t('add') }}
        </button>
        <button
          class="btn w-24 text-lg"
          data-testid="close-button"
          @click="closeModal"
        >
          {{ $t('close') }}
        </button>
      </div>
    </div>
    <form
      method="dialog"
      class="modal-backdrop"
      @click="closeModal"
    >
      <button>{{ $t('close') }}</button>
    </form>
  </dialog>
</template>
