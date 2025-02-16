import { Injectable } from "@angular/core";
import { ControllerService } from "../controllers/controller.service";
import {
    ControllerLocation,
    Script,
    ScriptChannelResource,
    ScriptChannelType
} from "astros-common";
import {
    LocationDetails,
    ChannelDetails
} from "@src/models/scripting";



@Injectable({
    providedIn: 'root'
})
export class ScriptResourcesService {

    locations: Map<string, LocationDetails>;

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

        this.loadResources();
    }

    getChannelDetailsList(scriptChannelType: ScriptChannelType, available = true, location = ''): ChannelDetails[] {
        switch (scriptChannelType) {
            case ScriptChannelType.GENERIC_I2C:
                return this.getChannelDetailsFromMap(this.genericI2cChannels, available, location);
            case ScriptChannelType.GENERIC_UART:
                return this.getChannelDetailsFromMap(this.genericSerialChannels, available, location);
            case ScriptChannelType.SERVO:
                return this.getChannelDetailsFromMap(this.servoChannels, available, location);
            case ScriptChannelType.GPIO:
                return this.getChannelDetailsFromMap(this.gpioChannels, available, location);
            case ScriptChannelType.KANGAROO:
                return this.getChannelDetailsFromMap(this.kangarooChannels, available, location);
            case ScriptChannelType.AUDIO:
                return this.getChannelDetailsFromMap(this.audioChannels, available, location);
        }

        return [];
    }

    getScriptChannelResource(id: string, scriptChannelType: ScriptChannelType): ScriptChannelResource | undefined {
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

    setChannelAvailablity(id: string, scriptChannelType: ScriptChannelType, available: boolean) {
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

    applyScript(script: Script){
        for (const ch of script.scriptChannels){
            this.setChannelAvailablity(ch.channelId, ch.channelType, false);
        }
    }

    //#region Utiltiy

    private getChannelDetailsFromMap(map: Map<string, ScriptChannelResource>, availableOnly: boolean, locationFilter: string,): ChannelDetails[] {

        const details = new Array<ChannelDetails>();

        for (const resource of map.values()) {
            if (locationFilter && resource.locationId != locationFilter) continue;
            if (availableOnly && !resource.available) continue;

            const locationName = this.locations.get(resource.locationId)?.name;

            const name = `${locationName} - ${resource.name}`;
            details.push({ id: resource.channelId, name: name, available: resource.available });
        }

        return details;
    }
    //#region 


    //#region Load Resources

    private loadResources(): void {
        this.controllerService.getLoadedLocations().subscribe((locations) => {

            if (locations.bodyModule) {
                this.addLocationResources(locations.bodyModule)
            }
            if (locations.coreModule) {
                this.addLocationResources(locations.coreModule)
            }
            if (locations.domeModule) {
                this.addLocationResources(locations.domeModule)
            }
        });
    }

    private addLocationResources(location: ControllerLocation): void {
        this.locations.set(location.id, { id: location.id, name: location.locationName });

        const locationResources: ScriptChannelResource[] = [];

        for (const module of location.i2cModules) {
            locationResources.push(...module.getScriptResources());
        }

        for (const module of location.uartModules) {
            locationResources.push(...module.getScriptResources());
        }

        locationResources.push(...location.gpioModule.getScriptResources());

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