import { Injectable } from '@angular/core';
import { ControllerService } from '../controllers/controller.service';
import {
  ControllerLocation,
  getGpioScriptResources,
  getI2cScriptResources,
  getUartScriptResources,
  Script,
  ScriptChannelResource,
  ScriptChannelType,
} from 'astros-common';
import { LocationDetails, ChannelDetails } from '@src/models/scripting';

@Injectable({
  providedIn: 'root',
})
export class ScriptResourcesService {
  loaded = false;

  locations: Map<string, LocationDetails>;

  chTypes: ScriptChannelType[] = [
    ScriptChannelType.GENERIC_I2C,
    ScriptChannelType.GENERIC_UART,
    ScriptChannelType.SERVO,
    ScriptChannelType.GPIO,
    ScriptChannelType.KANGAROO,
    ScriptChannelType.AUDIO,
  ];

  genericI2cChannels: Map<string, ScriptChannelResource>;
  genericSerialChannels: Map<string, ScriptChannelResource>;
  servoChannels: Map<string, ScriptChannelResource>;
  gpioChannels: Map<string, ScriptChannelResource>;
  kangarooChannels: Map<string, ScriptChannelResource>;
  audioChannels: Map<string, ScriptChannelResource>;

  constructor(private controllerService: ControllerService) {
    this.locations = new Map<string, LocationDetails>();

    this.genericI2cChannels = new Map<string, ScriptChannelResource>();
    this.genericSerialChannels = new Map<string, ScriptChannelResource>();
    this.servoChannels = new Map<string, ScriptChannelResource>();
    this.gpioChannels = new Map<string, ScriptChannelResource>();
    this.kangarooChannels = new Map<string, ScriptChannelResource>();
    this.audioChannels = new Map<string, ScriptChannelResource>();
  }

  getLocationDetailsList(): LocationDetails[] {
    const details = new Array<LocationDetails>();

    for (const location of this.locations.values()) {
      details.push(location);
    }

    return details;
  }

  getChannelDetailsMap(
    availableOnly = true,
  ): Map<ScriptChannelType, ChannelDetails[]> {
    const map = new Map<ScriptChannelType, ChannelDetails[]>();

    for (const chType of this.chTypes) {
      // Skip NONE type
      if (chType === ScriptChannelType.NONE) continue;

      // Add all channel types, but only available channels if requested
      map.set(chType, this.getChannelDetailsList(chType, availableOnly));
    }

    return map;
  }

  getChannelDetailsList(
    scriptChannelType: ScriptChannelType,
    availableOnly = true,
  ): ChannelDetails[] {
    switch (scriptChannelType) {
      case ScriptChannelType.GENERIC_I2C:
        return this.getChannelDetailsFromMap(
          this.genericI2cChannels,
          availableOnly,
        );
      case ScriptChannelType.GENERIC_UART:
        return this.getChannelDetailsFromMap(
          this.genericSerialChannels,
          availableOnly,
        );
      case ScriptChannelType.SERVO:
        return this.getChannelDetailsFromMap(this.servoChannels, availableOnly);
      case ScriptChannelType.GPIO:
        return this.getChannelDetailsFromMap(this.gpioChannels, availableOnly);
      case ScriptChannelType.KANGAROO:
        return this.getChannelDetailsFromMap(
          this.kangarooChannels,
          availableOnly,
        );
      case ScriptChannelType.AUDIO:
        return this.getChannelDetailsFromMap(this.audioChannels, availableOnly);
    }

    return [];
  }

  getScriptChannelResource(
    id: string,
    scriptChannelType: ScriptChannelType,
  ): ScriptChannelResource | undefined {
    switch (scriptChannelType) {
      case ScriptChannelType.GENERIC_I2C:
        return this.genericI2cChannels.get(id);
      case ScriptChannelType.GENERIC_UART:
        return this.genericSerialChannels.get(id);
      case ScriptChannelType.SERVO:
        return this.servoChannels.get(id);
      case ScriptChannelType.GPIO:
        return this.gpioChannels.get(id);
      case ScriptChannelType.KANGAROO:
        return this.kangarooChannels.get(id);
      case ScriptChannelType.AUDIO:
        return this.audioChannels.get(id);
      default:
        return undefined;
    }
  }

  setChannelAvailablity(
    id: string,
    scriptChannelType: ScriptChannelType,
    available: boolean,
  ) {
    switch (scriptChannelType) {
      case ScriptChannelType.GENERIC_I2C:
        this.genericI2cChannels.get(id)!.available = available;
        break;
      case ScriptChannelType.GENERIC_UART:
        this.genericSerialChannels.get(id)!.available = available;
        break;
      case ScriptChannelType.SERVO:
        this.servoChannels.get(id)!.available = available;
        break;
      case ScriptChannelType.GPIO:
        this.gpioChannels.get(id)!.available = available;
        break;
      case ScriptChannelType.KANGAROO:
        this.kangarooChannels.get(id)!.available = available;
        break;
      case ScriptChannelType.AUDIO:
        this.audioChannels.get(id)!.available = available;
        break;
    }
  }

  applyScript(script: Script) {
    for (const ch of script.scriptChannels) {
      this.setChannelAvailablity(ch.moduleChannelId, ch.channelType, false);
    }
  }

  //#region Utility

  private getChannelDetailsFromMap(
    map: Map<string, ScriptChannelResource>,
    availableOnly: boolean,
  ): ChannelDetails[] {
    const details = new Array<ChannelDetails>();

    for (const resource of map.values()) {
      if (availableOnly && !resource.available) continue;

      const name = `${resource.name}`;
      details.push({
        id: resource.channelId,
        name: name,
        locationId: resource.locationId,
        available: resource.available,
        scriptChannelType: resource.scriptChannelType,
      });
    }

    return details;
  }
  //#region

  //#region Load Resources

  public loadResources(): void {

    this.locations.clear();

    this.genericI2cChannels.clear();
    this.genericSerialChannels.clear();
    this.servoChannels.clear();
    this.gpioChannels.clear();
    this.kangarooChannels.clear();
    this.audioChannels.clear();

    this.controllerService.getLoadedLocations().subscribe((locations) => {
      if (locations.bodyModule) {
        this.addLocationResources(locations.bodyModule);
      }
      if (locations.coreModule) {
        this.addLocationResources(locations.coreModule);
      }
      if (locations.domeModule) {
        this.addLocationResources(locations.domeModule);
      }

      this.loaded = true;
    });
  }

  private addLocationResources(location: ControllerLocation): void {
    this.locations.set(location.id, {
      id: location.id,
      name: location.locationName,
    });

    const locationResources: ScriptChannelResource[] = [];

    for (const module of location.i2cModules) {
      locationResources.push(...getI2cScriptResources(module));
    }

    for (const module of location.uartModules) {
      locationResources.push(...getUartScriptResources(module));
    }

    locationResources.push(...getGpioScriptResources(location.gpioModule));

    this.addChannelResources(locationResources);
  }

  private addChannelResources(resources: ScriptChannelResource[]): void {
    for (const resource of resources) {
      switch (resource.scriptChannelType) {
        case ScriptChannelType.GENERIC_I2C:
          this.genericI2cChannels.set(resource.channelId, resource);
          break;
        case ScriptChannelType.GENERIC_UART:
          this.genericSerialChannels.set(resource.channelId, resource);
          break;
        case ScriptChannelType.SERVO:
          this.servoChannels.set(resource.channelId, resource);
          break;
        case ScriptChannelType.GPIO:
          this.gpioChannels.set(resource.channelId, resource);
          break;
        case ScriptChannelType.KANGAROO:
          this.kangarooChannels.set(resource.channelId, resource);
          break;
        case ScriptChannelType.AUDIO:
          this.audioChannels.set(resource.channelId, resource);
          break;
      }
    }
  }

  //#endregion
}
