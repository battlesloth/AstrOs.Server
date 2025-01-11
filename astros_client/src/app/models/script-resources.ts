
import {
    ChannelType, 
    I2cChannel,  
    Script,
    ControllerLocation,
    GpioChannel,
} from "astros-common";
import { ModuleChannelType } from "astros-common/dist/control_module/base_channel";
import { UartChannel } from "astros-common/dist/control_module/uart/uart_channel";

export class LocationDetails {
    id: number;
    name: string;

    constructor(id: number, name: string) {
        this.id = id;
        this.name = name;
    }
}

export class ChannelValue {
    available: boolean; 
    channel: ModuleChannelType

    constructor(channel: ModuleChannelType, available: boolean) {
        this.available = available;
        this.channel = channel;
    }
}

export class ScriptResources {

    locations: Map<number, LocationDetails>;

    uartChannels: Map<number, ChannelValue[]>;

    servoChannels: Map<number, ChannelValue[]>;

    i2cChannels: Map<number, ChannelValue[]>;

    gpioChannels: Map<number, ChannelValue[]>;

    constructor(locations: ControllerLocation[]) {
        this.locations = new Map<number, LocationDetails>();
        this.servoChannels = new Map<number, ChannelValue[]>();
        this.i2cChannels = new Map<number, ChannelValue[]>();
        this.uartChannels = new Map<number, ChannelValue[]>();
        this.gpioChannels = new Map<number, ChannelValue[]>();

        locations.forEach(loc => {

            this.locations.set(loc.id, new LocationDetails(loc.id, loc.locationName));

            this.i2cChannels.set(loc.id, loc.i2cModule.channels.map((ch: I2cChannel) => new ChannelValue(ch, ch.enabled)));
            this.gpioChannels.set(loc.id, loc.gpioModule.channels.map((ch: GpioChannel) => new ChannelValue(ch, ch.enabled)));

            this.uartChannels.get(loc.id)?.sort((a, b) => { return a.channel.id - b.channel.id });
            this.servoChannels.get(loc.id)?.sort((a, b) => { return a.channel.id - b.channel.id });
            this.i2cChannels.get(loc.id)?.sort((a, b) => { return a.channel.id - b.channel.id });
            this.gpioChannels.get(loc.id)?.sort((a, b) => { return a.channel.id - b.channel.id });
        });
    }

    applyScript(script: Script): void {

        script.scriptChannels.forEach(ch => {
            switch (ch.type) {
                case ChannelType.uart:
                    this.provisionChannel(this.uartChannels, ch.locationId, ch.channel.id);
                    break;
                case ChannelType.i2c:
                    this.provisionChannel(this.i2cChannels, ch.locationId, ch.channel.id);
                    break;
                case ChannelType.audio:
                    this.locations.delete(4);
                    break;
                case ChannelType.gpio:
                    this.provisionChannel(this.gpioChannels, ch.locationId, ch.channel.id);
                    break;
            }
        });
    }

    getAvailableModules(): Map<number, Map<ChannelType, string>> {
        const result = new Map<number, Map<ChannelType, string>>();

        for (const ctrl of this.locations.keys()) {
            if (ctrl === 4 || ctrl === 0) {
                continue;
            }

            result.set(ctrl, this.setModuleValues(ctrl));
        }

        return result;
    }

    getAvailableChannels(): Map<number, Map<ChannelType, ChannelValue[]>> {
        
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = new Map<number, Map<ChannelType, any>>()

        for (const ctrl of this.locations.keys()) {
            if (ctrl === 4 || ctrl === 0) {
                continue;
            }
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const vals = new Map<ChannelType, any>();

            vals.set(ChannelType.i2c, this.i2cChannels.get(ctrl));
            vals.set(ChannelType.uart, this.uartChannels.get(ctrl));
            vals.set(ChannelType.gpio, this.gpioChannels.get(ctrl));

            result.set(ctrl, vals);
        }

        return result;
    }

    private setModuleValues(_: number): Map<ChannelType, string> {
        const vals = new Map<ChannelType, string>();

        vals.set(ChannelType.i2c, "I2C");
        vals.set(ChannelType.uart, "Serial");
        vals.set(ChannelType.gpio, "GPIO");

        return vals;
    }

    addChannel(controller: number, type: ChannelType, id: number): ModuleChannelType | undefined {

        if (controller === 4) {
            this.locations.delete(4);
            return undefined;
        }

        switch (type) {
            case ChannelType.uart:
                return this.provisionChannel(this.uartChannels, controller, id);
            case ChannelType.i2c:
                return this.provisionChannel(this.i2cChannels, controller, id);
            case ChannelType.gpio:
                return this.provisionChannel(this.gpioChannels, controller, id);
        }

        return undefined;
    }

    provisionChannel(map: Map<number, ChannelValue[]>, location: number, id: number) :ModuleChannelType | undefined {
        const idx = map.get(location)?.findIndex(x => x.channel.id === id);
        if (idx != undefined && idx > -1) {
            this.gpioChannels.get(location)![idx].available = false;
            return this.gpioChannels.get(location)![idx].channel
        }

        return undefined;
    }

    removeChannel(location: number, type: ChannelType, id: number): void {

        if (location === 4) {
            this.locations.set(4, new LocationDetails(4, 'Audio Playback'))
            return
        }

        switch (type) {
            case ChannelType.uart:
                this.deprovisionChannel(this.uartChannels, location, id);
                break;
            case ChannelType.i2c:
                this.deprovisionChannel(this.i2cChannels, location, id);
                break;
            case ChannelType.gpio:
                this.deprovisionChannel(this.gpioChannels, location, id);    
                break;
        }
    }

    deprovisionChannel(map: Map<number, ChannelValue[]>, location: number, id: number): void {
        const idx = map.get(location)?.findIndex(x => x.channel.id === id);
        if (idx !== undefined && idx > -1) {
            map.get(location)![idx].available = true;
        }
    }
} 