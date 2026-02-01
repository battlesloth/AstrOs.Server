import { defineStore } from 'pinia';
import { ref } from 'vue';
import { useScriptResources } from '@/composables/useScriptResources';
import { useLocationStore } from './location';
import apiService from '@/api/apiService';
import { SCRIPTS } from '@/api/endpoints';
import type { Channel, Script, ScriptChannel, ScriptChannelResource, ScriptEvent } from '@/models';
import { ScriptChannelType, Location, UploadStatus } from '@/enums';
import { v4 as uuid } from 'uuid';
import { moduleChannelTypeFromSubType } from '@/models';
import { useEventConverter } from '@/composables/useEventConverter';
import type { ChannelTestValue } from '@/models/scripter/channelTestValue';

export const useScripterStore = defineStore('scripter', () => {
  const isLoading = ref(false);
  const isSaving = ref(false);
  const script = ref<Script | null>(null);

  const locationsStore = useLocationStore();

  const { convertEventsForChannelType } = useEventConverter();

  const {
    loadResources,
    applyScript,
    getLocationDetailsList,
    getChannelDetailsMap,
    getChannelDetailsList,
    getScriptChannelResource,
    setChannelAvailability,
  } = useScriptResources();

  async function createNewScript() {
    isLoading.value = true;
    try {
      const result = await locationsStore.loadLocationsFromApi();

      if (!result.success) {
        throw new Error(`Failed to load locations for scripter: ${result.error}`);
      }

      loadResources(locationsStore.getLocationCollection());

      script.value = {
        id: generateScriptId(5),
        scriptName: 'New Script',
        description: '',
        lastSaved: new Date('1970-01-01T00:00:00Z'),
        deploymentStatus: {
          [Location.BODY]: { date: undefined, value: UploadStatus.NOT_UPLOADED },
          [Location.CORE]: { date: undefined, value: UploadStatus.NOT_UPLOADED },
          [Location.DOME]: { date: undefined, value: UploadStatus.NOT_UPLOADED },
          [Location.UNKNOWN]: { date: undefined, value: UploadStatus.NOT_UPLOADED },
        },
        scriptChannels: [],
      };

      applyScript(script.value);
      return { success: true };
    } catch (error) {
      console.error('Failed to create new script:', error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    } finally {
      isLoading.value = false;
    }
  }

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
    resourceId: string,
    channelType: ScriptChannelType,
  ): {
    success: boolean;
    id: string;
    name: string;
  } {
    const resource = getScriptChannelResource(resourceId, channelType);
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
    setChannelAvailability(resourceId, channelType, false);

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

  function swapChannels(
    chAResourceId: string,
    chBResourceId: string,
    chType: ScriptChannelType,
  ): { success: boolean; error?: string; chA?: Channel; chB?: Channel } {
    if (!script.value) {
      return { success: false, error: 'No script loaded.' };
    }

    const resourceA = getScriptChannelResource(chAResourceId, chType);
    const resourceB = getScriptChannelResource(chBResourceId, chType);

    if (!resourceA || !resourceB) {
      return {
        success: false,
        error: `Channel resource not found: ${resourceA ? `chBResourceId:${chBResourceId}` : resourceB ? `chAResourceId:${chAResourceId}` : `chAResourceId:${chAResourceId}, chBResourceId:${chBResourceId}`}`,
      };
    }

    const idxA = script.value.scriptChannels.findIndex(
      (ch) => ch.moduleChannel.id === resourceA.channel.id,
    );
    const idxB = script.value?.scriptChannels.findIndex(
      (ch) => ch.moduleChannel.id === resourceB.channel.id,
    );

    if (idxA === undefined || idxA === -1) {
      return { success: false, error: `Channel with id ${chAResourceId} not found in script.` };
    }

    if (idxB === undefined || idxB === -1) {
      console.warn(
        `Channel with id ${chBResourceId} not found in script. Assume we are swapping for an unused channel.`,
      );
      setChannelAvailability(chAResourceId, chType, true);
      setChannelAvailability(chBResourceId, chType, false);
      swapToUnusedChannel(idxA, resourceA, resourceB);
    } else {
      swapTwoChannels(idxA, resourceA, idxB, resourceB);
    }

    const chAId = script.value.scriptChannels[idxA]!.id;
    let chBId: string = '';
    if (idxB !== -1) {
      chBId = script.value.scriptChannels[idxB]!.id;
    }

    return {
      success: true,
      chA: {
        id: chAId,
        name: resourceA.name,
        channelType: resourceA.scriptChannelType,
        events: [],
      },
      chB: {
        id: chBId,
        name: resourceB.name,
        channelType: resourceB.scriptChannelType,
        events: [],
      },
    };
  }

  function swapToUnusedChannel(
    index: number,
    original: ScriptChannelResource,
    replacement: ScriptChannelResource,
  ) {
    updateChannelValues(index, original, replacement);
  }

  function swapTwoChannels(
    idxA: number,
    resourceA: ScriptChannelResource,
    idxB: number,
    resourceB: ScriptChannelResource,
  ) {
    updateChannelValues(idxA, resourceA, resourceB);
    updateChannelValues(idxB, resourceB, resourceA);
  }

  function updateChannelValues(
    index: number,
    original: ScriptChannelResource,
    replacement: ScriptChannelResource,
  ) {
    const events = script.value!.scriptChannels[index]!.events;

    script.value!.scriptChannels[index]!.parentModuleId = replacement.parentModuleId;
    script.value!.scriptChannels[index]!.moduleChannelId = replacement.channel.id;
    script.value!.scriptChannels[index]!.channelType = replacement.scriptChannelType;
    script.value!.scriptChannels[index]!.moduleChannelType = moduleChannelTypeFromSubType(
      replacement.channel.moduleSubType,
    );
    script.value!.scriptChannels[index]!.moduleChannel = replacement.channel;

    script.value!.scriptChannels[index]!.events = convertEventsForChannelType(
      events,
      original.channel.moduleSubType,
      replacement.channel,
    );
  }

  function getResourceIdByChannelId(channelId: string): { success: boolean; resourceId?: string } {
    if (!script.value) {
      return { success: false };
    }

    const channel = script.value.scriptChannels.find((ch) => ch.id === channelId);
    if (!channel) {
      return { success: false };
    }

    return { success: true, resourceId: channel.moduleChannel.id };
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

  function getChannelTestValue(chId: string): ChannelTestValue | null {
    if (!script.value) return null;
    const channel = script.value.scriptChannels.find((ch) => ch.id === chId);
    if (!channel) return null;

    const resource = getScriptChannelResource(channel.moduleChannelId, channel.channelType);
    if (!resource) return null;

    return {
      locationId: resource.locationId,
      moduleId: resource.parentModuleId,
      moduleChannel: channel.moduleChannel,
      moduleType: resource.channel.moduleType,
      moduleSubType: resource.channel.moduleSubType,
      channelId: channel.moduleChannelId,
      channelType: channel.channelType,
    };
  }

  function generateScriptId(length: number): string {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = `s${Math.floor(Date.now() / 1000)}`;
    const charactersLength = characters.length;
    for (let i = 0; i < length; i++) {
      result += characters.charAt(Math.floor(Math.random() * charactersLength));
    }
    return result;
  }

  return {
    isLoading,
    isSaving,
    script,
    createNewScript,
    loadScripterData,
    saveScript,
    getLocationDetailsList,
    getChannelDetailsMap,
    getChannelDetailsList,
    getScriptChannelResource,
    addChannel,
    removeChannel,
    swapChannels,
    getChannel,
    addEventToChannel,
    removeEventFromChannel,
    getResourceIdByChannelId,
    getChannelTestValue,
  };
});
