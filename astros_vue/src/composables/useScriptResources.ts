import { ref } from 'vue';
import type {
  ChannelDetails,
  LocationDetails,
  ScriptChannelResource,
  Script,
  ControllerLocation,
  LocationCollection,
} from '@/models';
import { Location, ScriptChannelTypes, ScriptChannelType } from '@/enums';
import { useModuleScriptResources } from './useModuleScriptResources';

export function useScriptResources() {
  const locations = ref<Map<Location, LocationDetails>>(new Map());

  const genericI2cChannels = ref<Map<string, ScriptChannelResource>>(new Map());
  const genericSerialChannels = ref<Map<string, ScriptChannelResource>>(new Map());
  const servoChannels = ref<Map<string, ScriptChannelResource>>(new Map());
  const gpioChannels = ref<Map<string, ScriptChannelResource>>(new Map());
  const kangarooChannels = ref<Map<string, ScriptChannelResource>>(new Map());
  const audioChannels = ref<Map<string, ScriptChannelResource>>(new Map());

  const { getGpioScriptResources, getI2cScriptResources, getUartScriptResources } =
    useModuleScriptResources();

  function clearResources() {
    locations.value.clear();
    genericI2cChannels.value.clear();
    genericSerialChannels.value.clear();
    servoChannels.value.clear();
    gpioChannels.value.clear();
    kangarooChannels.value.clear();
    audioChannels.value.clear();
  }

  function loadResources(locations: LocationCollection) {
    clearResources();

    if (locations.bodyModule) {
      addLocationResources(locations.bodyModule);
    }
    if (locations.coreModule) {
      addLocationResources(locations.coreModule);
    }
    if (locations.domeModule) {
      addLocationResources(locations.domeModule);
    }
  }

  function addLocationResources(location: ControllerLocation) {
    const assigned = location.controller?.address ? true : false;

    locations.value.set(location.locationName, {
      id: location.id,
      name: location.locationName,
      assigned: assigned,
    });

    const locationResources: ScriptChannelResource[] = [];

    for (const module of location.i2cModules) {
      locationResources.push(...getI2cScriptResources(module));
    }

    for (const module of location.uartModules) {
      locationResources.push(...getUartScriptResources(module));
    }

    locationResources.push(...getGpioScriptResources(location.gpioModule));

    addChannelResources(locationResources);
  }

  function addChannelResources(resources: ScriptChannelResource[]): void {
    for (const resource of resources) {
      switch (resource.scriptChannelType) {
        case ScriptChannelType.GENERIC_I2C:
          genericI2cChannels.value.set(resource.channelId, resource);
          break;
        case ScriptChannelType.GENERIC_UART:
          genericSerialChannels.value.set(resource.channelId, resource);
          break;
        case ScriptChannelType.SERVO:
          servoChannels.value.set(resource.channelId, resource);
          break;
        case ScriptChannelType.GPIO:
          gpioChannels.value.set(resource.channelId, resource);
          break;
        case ScriptChannelType.KANGAROO:
          kangarooChannels.value.set(resource.channelId, resource);
          break;
        case ScriptChannelType.AUDIO:
          audioChannels.value.set(resource.channelId, resource);
          break;
      }
    }
  }

  function getLocationDetailsList(): LocationDetails[] {
    const details = new Array<LocationDetails>();

    for (const location of locations.value.values()) {
      details.push(location);
    }
    return details;
  }

  function getChannelDetailsMap(availableOnly = true): Map<ScriptChannelType, ChannelDetails[]> {
    const maps = new Map<ScriptChannelType, ChannelDetails[]>();

    for (const chType of ScriptChannelTypes) {
      // Skip NONE type
      if (chType === ScriptChannelType.NONE) continue;
      maps.set(chType, getChannelDetailsList(chType, availableOnly));
    }

    return maps;
  }

  function getChannelDetailsList(
    channelType: ScriptChannelType,
    availableOnly = true,
  ): ChannelDetails[] {
    switch (channelType) {
      case ScriptChannelType.GENERIC_I2C:
        return getChannelDetailsFromMap(genericI2cChannels.value, availableOnly);
      case ScriptChannelType.GENERIC_UART:
        return getChannelDetailsFromMap(genericSerialChannels.value, availableOnly);
      case ScriptChannelType.SERVO:
        return getChannelDetailsFromMap(servoChannels.value, availableOnly);
      case ScriptChannelType.GPIO:
        return getChannelDetailsFromMap(gpioChannels.value, availableOnly);
      case ScriptChannelType.KANGAROO:
        return getChannelDetailsFromMap(kangarooChannels.value, availableOnly);
      case ScriptChannelType.AUDIO:
        return getChannelDetailsFromMap(audioChannels.value, availableOnly);
      default:
        return [];
    }
  }

  function getChannelDetailsFromMap(
    channelMap: Map<string, ScriptChannelResource>,
    availableOnly: boolean,
  ): ChannelDetails[] {
    const details = new Array<ChannelDetails>();
    for (const channel of channelMap.values()) {
      if (availableOnly && !channel.available) {
        continue;
      }
      details.push({
        id: channel.channelId,
        name: channel.name,
        locationId: channel.locationId,
        available: channel.available,
        scriptChannelType: channel.scriptChannelType,
      });
    }
    return details;
  }

  function getScriptChannelResource(
    resourceId: string,
    scriptChannelType: ScriptChannelType,
  ): ScriptChannelResource | undefined {
    switch (scriptChannelType) {
      case ScriptChannelType.GENERIC_I2C:
        return genericI2cChannels.value.get(resourceId);
      case ScriptChannelType.GENERIC_UART:
        return genericSerialChannels.value.get(resourceId);
      case ScriptChannelType.SERVO:
        return servoChannels.value.get(resourceId);
      case ScriptChannelType.GPIO:
        return gpioChannels.value.get(resourceId);
      case ScriptChannelType.KANGAROO:
        return kangarooChannels.value.get(resourceId);
      case ScriptChannelType.AUDIO:
        return audioChannels.value.get(resourceId);
      default:
        return undefined;
    }
  }

  function setChannelAvailability(
    resourceId: string,
    scriptChannelType: ScriptChannelType,
    available: boolean,
  ) {
    console.log(
      `Setting availability of channel ${resourceId} of type ${ScriptChannelType[scriptChannelType]} to ${available}`,
    );
    switch (scriptChannelType) {
      case ScriptChannelType.GENERIC_I2C:
        genericI2cChannels.value.get(resourceId)!.available = available;
        break;
      case ScriptChannelType.GENERIC_UART:
        genericSerialChannels.value.get(resourceId)!.available = available;
        break;
      case ScriptChannelType.SERVO:
        servoChannels.value.get(resourceId)!.available = available;
        break;
      case ScriptChannelType.GPIO:
        gpioChannels.value.get(resourceId)!.available = available;
        break;
      case ScriptChannelType.KANGAROO:
        kangarooChannels.value.get(resourceId)!.available = available;
        break;
      case ScriptChannelType.AUDIO:
        audioChannels.value.get(resourceId)!.available = available;
        break;
    }
  }

  function applyScript(script: Script) {
    for (const ch of script.scriptChannels) {
      setChannelAvailability(ch.moduleChannelId, ch.channelType, false);
    }
  }

  return {
    locations,
    genericI2cChannels,
    genericSerialChannels,
    servoChannels,
    gpioChannels,
    kangarooChannels,
    audioChannels,
    loadResources,
    applyScript,
    getLocationDetailsList,
    getChannelDetailsMap,
    getChannelDetailsList,
    getScriptChannelResource,
    setChannelAvailability,
  };
}
