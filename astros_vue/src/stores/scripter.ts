import { defineStore } from 'pinia';
import { ref } from 'vue';
import { useScriptResources } from '@/composables/useScriptResources';
import { useLocationStore } from './location';
import apiService from '@/api/apiService';
import { SCRIPTS } from '@/api/endpoints';
import type { Script } from '@/models/scripts/script';
import type { ScriptChannelType } from '@/enums/scripts/scriptChannelType';
import { v4 as uuid } from 'uuid';
import type { ScriptChannel } from '@/models/scripts/scriptChannel';
import type { ScriptEvent } from '@/models/scripts/scriptEvent';
import { moduleChannelTypeFromSubType } from '@/models/controllers/moduleChannels';

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
      const response = await apiService.post(`${SCRIPTS}/?id=${script.value?.id}`, script.value);

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

  function addChannel(id: string, channelType: ScriptChannelType): {
    success: boolean;
    id: string;
    name: string
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
      events: new Map<number, ScriptEvent>(),
    };

    script.value.scriptChannels.push(newChannel);
    setChannelAvailability(id, channelType, false);

    return { success: true, id: newChannel.id, name: resource.name };
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
  }
});
