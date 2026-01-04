import { defineStore } from 'pinia';
import { ref } from 'vue';
import { useScriptResources } from '@/composables/useScriptResources';
import { useLocationStore } from './location';
import apiService from '@/api/apiService';
import { SCRIPTS } from '@/api/endpoints';
import type { Script, ScriptChannel, ScriptEvent } from '@/models';
import { ScriptChannelType } from '@/enums';
import { v4 as uuid } from 'uuid';
import { moduleChannelTypeFromSubType } from '@/models';

export const useScripterStore = defineStore('scripter', () => {
  const isLoading = ref(false);
  const isSaving = ref(false);
  const script = ref<Script | null>(null);

  const locationsStore = useLocationStore();

  const {
    loadResources,
    applyScript,
    getLocationDetailsList,
    getChannelDetailsMap,
    getChannelDetailsList,
    getScriptChannelResource,
    setChannelAvailability,
  } = useScriptResources();

  async function loadScripterData(scriptId: string) {
    isLoading.value = true;
    try {
      const result = await locationsStore.loadLocationsFromApi();

      if (!result.success) {
        throw new Error(`Failed to load locations for scripter: ${result.error}`);
      }

      loadResources(locationsStore.getLocationCollection());

      const response = await apiService.get(`${SCRIPTS}/?id=${scriptId}`);

      if (!response) {
        throw new Error('Script not found');
      }

      script.value = response as Script;

      console.log('loaded script channels:', script.value.scriptChannels);

      applyScript(script.value);

      return { success: true };
    } catch (error) {
      console.error('Failed to load scripter data:', error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    } finally {
      isLoading.value = false;
    }
  }

  async function saveScript() {
    isSaving.value = true;
    try {
      console.log('channels to save:', script.value?.scriptChannels);

      const response = await apiService.put(SCRIPTS, script.value);

      if (!response || response.message !== 'success') {
        throw new Error('Failed to save script');
      }

      return { success: true };
    } catch (error) {
      console.error('Failed to save script:', error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    } finally {
      isSaving.value = false;
    }
  }

  function addChannel(
    id: string,
    channelType: ScriptChannelType,
  ): {
    success: boolean;
    id: string;
    name: string;
  } {
    const resource = getScriptChannelResource(id, channelType);
    if (!resource || !script.value) return { success: false, id: '', name: '' };

    const newChannel: ScriptChannel = {
      id: uuid(),
      scriptId: script.value.id,
      channelType: resource.scriptChannelType,
      parentModuleId: resource.parentModuleId,
      moduleChannelId: resource.channel.id,
      moduleChannelType: moduleChannelTypeFromSubType(resource.channel.moduleSubType),
      moduleChannel: resource.channel,
      maxDuration: 0,
      events: {},
    };

    script.value.scriptChannels.push(newChannel);
    setChannelAvailability(id, channelType, false);

    return { success: true, id: newChannel.id, name: resource.name };
  }

  function getChannel(id: string): ScriptChannel | null {
    if (!script.value) return null;
    const channel = script.value.scriptChannels.find((ch) => ch.id === id);
    return channel || null;
  }

  function removeChannel(id: string) {
    if (!script.value) return;
    const index = script.value.scriptChannels.findIndex((ch) => ch.id === id);
    if (index === -1) {
      console.warn(`Channel with id ${id} not found in script.`);
      return;
    }
    const channelType = script.value.scriptChannels[index]!.channelType;
    const resourceId = script.value.scriptChannels[index]!.moduleChannelId;
    script.value.scriptChannels.splice(index, 1);
    setChannelAvailability(resourceId, channelType, true);
  }

  function addEventToChannel(
    channelId: string,
    event: ScriptEvent,
  ): { success: boolean; event: ScriptEvent | undefined; channelType: ScriptChannelType } {
    if (!script.value) {
      console.warn('No script loaded.');
      return { success: false, event: undefined, channelType: ScriptChannelType.NONE };
    }

    const idx = script.value?.scriptChannels.findIndex((ch) => ch.id === channelId);
    if (idx === undefined || idx === -1) {
      console.warn(`Channel with id ${channelId} not found in script.`);
      return { success: false, event: undefined, channelType: ScriptChannelType.NONE };
    }

    if (script.value) {
      script.value.scriptChannels[idx]!.events[event.id] = event;
    }

    console.log('channel events:', script.value.scriptChannels[idx]!.events);

    return {
      success: true,
      event: script.value.scriptChannels[idx]!.events[event.id],
      channelType: script.value.scriptChannels[idx]!.channelType,
    };
  }

  function removeEventFromChannel(channelId: string, eventId: string): { success: boolean } {
    if (!script.value) {
      console.warn('No script loaded.');
      return { success: false };
    }

    const idx = script.value?.scriptChannels.findIndex((ch) => ch.id === channelId);
    if (idx === undefined || idx === -1) {
      console.warn(`Channel with id ${channelId} not found in script.`);
      return { success: false };
    }

    if (script.value && script.value.scriptChannels[idx]!.events[eventId]) {
      delete script.value.scriptChannels[idx]!.events[eventId];
      return { success: true };
    } else {
      console.warn(`Event with id ${eventId} not found in channel ${channelId}.`);
      return { success: false };
    }
  }

  return {
    isLoading,
    isSaving,
    script,
    loadScripterData,
    saveScript,
    getLocationDetailsList,
    getChannelDetailsMap,
    getChannelDetailsList,
    getScriptChannelResource,
    addChannel,
    removeChannel,
    getChannel,
    addEventToChannel,
    removeEventFromChannel,
  };
});
