import { ChannelType, ControllerType, UartType, 
    KangarooAction, KangarooEvent, Script, 
    ScriptChannel, ScriptEvent, GenericSerialEvent } from "astros-common";
import { Utility } from "./utility";


export enum CommandType {
    none,
    pwm,
    i2c,
    genericSerial,
    kangaroo
}

class Kvp {
    time: number
    command: string;

    constructor(time: number, command: string) {
        this.time = time;
        this.command = command;
    }

}

export class ScriptConverter {

    convertScript(script: Script): Map<ControllerType, string> {

        try {
            const result = new Map<ControllerType, string>();

            const channelMap = new Map<ControllerType, Array<Kvp>>();

            channelMap.set(ControllerType.core, new Array<Kvp>());
            channelMap.set(ControllerType.dome, new Array<Kvp>());
            channelMap.set(ControllerType.body, new Array<Kvp>());

            for (const ch of script.scriptChannels) {
                const events = this.convertChannel(ch);

                const a = channelMap.get(ch.controllerType)?.concat(events);

                if (a) {
                    channelMap.set(ch.controllerType, a);
                }
            }

            channelMap.get(ControllerType.core)?.sort((a, b) => (a.time > b.time) ? 1 : -1);
            channelMap.get(ControllerType.dome)?.sort((a, b) => (a.time > b.time) ? 1 : -1);
            channelMap.get(ControllerType.body)?.sort((a, b) => (a.time > b.time) ? 1 : -1);

            const core = channelMap.get(ControllerType.core)?.map(x => x.command).join('');
            result.set(ControllerType.core, core ?? '');

            const dome = channelMap.get(ControllerType.dome)?.map(x => x.command).join('');
            result.set(ControllerType.dome, dome ?? '');

            const body = channelMap.get(ControllerType.body)?.map(x => x.command).join('');
            result.set(ControllerType.body, body ?? '');

            return result;
        }
        catch (err) {
            console.log(`Exception converting script${script.id}: ${err}`)
            return new Map<ControllerType, string>();
        }
    }

    convertChannel(channel: ScriptChannel): Array<Kvp> {

        const result = new Array<Kvp>();

        switch (channel.type) {
            case ChannelType.uart:
                return this.convertSerialEvents(channel);
            case ChannelType.i2c:
                break;
            case ChannelType.pwm:
                break
        }

        return result;
    }



    convertSerialEvents(channel: ScriptChannel): Array<Kvp> {
        const result = new Array<Kvp>()

        const uartType = channel.channel.type as UartType;

        // events in reverse order
        channel.eventsKvpArray.sort((a: any, b: any) => (a.value.time < b.value.time) ? 1 : -1);

        let nextEventTime = 0;

        for (let i = 0; i < channel.eventsKvpArray.length; i++) {

            const kvp = channel.eventsKvpArray[i];

            const evt = kvp.value as ScriptEvent

            let serialized = '';

            switch (uartType) {
                case UartType.genericSerial:
                    serialized = this.convertGenericSerial(evt, nextEventTime);
                    break;
                case UartType.kangaroo:
                    serialized = this.convertKangaroo(evt, nextEventTime);
                    break;
            }

            if (serialized.length > 0) {
                result.push(new Kvp(kvp.key, serialized));
            }

            nextEventTime = evt.time;
        }

        return result;
    }

    // |___|___ ___|___ ___ ... ___ ___ '|' |
    //  evt length  message             end
    convertGenericSerial(scriptEvent: ScriptEvent, nextEventTime: number): string {
        let command = '';

        let timeTill = 0;

        if (nextEventTime != 0) {
            timeTill = nextEventTime - scriptEvent.time;
        }

        const evt = JSON.parse(scriptEvent.dataJson) as GenericSerialEvent;

        command = evt.value;

        return command;
    }

    // |___|___|___|___ ___|___ ___|___ ___ ___ ___ '|' |
    //  evt ch  cmd spd     pos     time till       end
    convertKangaroo(scriptEvent: ScriptEvent, nextEventTime: number): string {

        let command = '';

        let timeTill = 0;

        if (nextEventTime != 0) {
            timeTill = nextEventTime - scriptEvent.time;
        }

        const evt = JSON.parse(scriptEvent.dataJson) as KangarooEvent;

        if (evt.ch1Action != KangarooAction.none) {
            command = this.convertChannelEvent(1, evt.ch1Action, evt.ch1Speed, evt.ch1Position,
                // if the ch2 action is none, use timeTill. Otherwise we have 2 actions for the
                // same time period, so don't delay untill after second action is done.
                evt.ch2Action === KangarooAction.none ? timeTill : 0);
        }
        if (evt.ch2Action != KangarooAction.none) {
            command = command + this.convertChannelEvent(2, evt.ch2Action, evt.ch2Speed, evt.ch2Position, timeTill);
        }

        return command;
    }

    convertChannelEvent(channel: number, action: KangarooAction, speed: number, position: number, timeTill: number) {

        const spdArray = Utility.numberToUint8Array(2, speed);
        const posArray = Utility.numberToUint8Array(2, position);
        const timeArry = Utility.numberToUint8Array(4, timeTill);

        // 124 is |
        const byteArray = new Uint8Array([CommandType.kangaroo, channel,
        spdArray[0], spdArray[1], posArray[0], posArray[1],
        timeArry[0], timeArry[1], timeArry[2], timeArry[3],
            124]);

        const encoder = new TextDecoder();
        return encoder.decode(byteArray);
    }
}

