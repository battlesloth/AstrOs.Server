<script setup lang="ts">
import { ref } from 'vue';
import type { ChannelDetails } from '@/models';
import { ScriptChannelType } from '@/enums';
import { useScripterStore } from '@/stores/scripter';
import { computed } from 'vue';

const scripterStore = useScripterStore();

const props = defineProps<{
  currentChannel: string;
  channelType: ScriptChannelType;
}>();

const selectedChannel = ref<ChannelDetails | null>(null);

const eligibleChannels = computed(() => {
  let result: ChannelDetails[] = [];

  const allChannels = scripterStore.getChannelDetailsList(props.channelType, false);

  // Filter out the current channel
  result = allChannels.filter((channel) => channel.id !== props.currentChannel);
  return result;
});

defineEmits<{
  (e: 'confirm', payload: { oldId: string; newId: string; chType: ScriptChannelType }): void;
  (e: 'close'): void;
}>();
</script>

<template>
  <dialog class="modal modal-open">
    <div class="modal-box max-w-lg">
      <h1 class="text-2xl font-bold mb-4">Swap Channel</h1>
      <div class="py-4">
        <div v-if="eligibleChannels?.length > 0">
          <select
            id="channelSelect"
            class="select select-bordered w-full text-lg"
            v-model="selectedChannel"
          >
            <option
              disabled
              :value="null"
            >
              Select a Channel
            </option>
            <option
              v-for="eligibleChannel in eligibleChannels"
              :key="eligibleChannel.id"
              :value="eligibleChannel"
            >
              {{ eligibleChannel.name }}
            </option>
          </select>
        </div>
        <div
          v-else
          class="text-center"
        >
          <p class="text-lg">No eligible channels available to swap.</p>
        </div>
      </div>

      <div class="modal-action justify-center mt-5">
        <button
          v-if="eligibleChannels?.length > 0"
          class="btn btn-primary w-24 text-lg"
          data-testid="confirm-button"
          @click="
            $emit('confirm', {
              oldId: props.currentChannel,
              newId: selectedChannel?.id!,
              chType: selectedChannel?.scriptChannelType!,
            })
          "
          :disabled="!selectedChannel"
        >
          Confirm
        </button>
        <button
          class="btn w-24 text-lg"
          data-testid="cancel-button"
          @click="$emit('close')"
        >
          Cancel
        </button>
      </div>
    </div>
  </dialog>
</template>
