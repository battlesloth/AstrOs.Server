import { ChannelType, ControllerType } from "./models/control_module/control_module";
import { UartType } from "./models/control_module/uart_module";
import { KangarooAction, KangarooEvent } from "./models/scripts/events/kangaroo_event";
import { Script } from "./models/scripts/script";
import { ScriptChannel } from "./models/scripts/script_channel";
import { ScriptEvent } from "./models/scripts/script_event";

enum commandType {
    none,
    pwm,
    i2c,
    genericSerial,
    kangaroo
}

export class ScriptConverter {

    constructor() {

    }

    convertScript(script: Script): Map<ControllerType, string> {

        const result = new Map<ControllerType, string>();

        // for each controller
        // for each channel, map events and convert to serial
        // take all the maps, insert into array, sort array by time
        return result;
    }

    convertChannel(channel: ScriptChannel): Map<number, string> {
        switch (channel.type) {
            case ChannelType.uart:
                return this.convertSerialEvents(channel);
            case ChannelType.i2c:
                break;
            case ChannelType.pwm:
                break
        }
    }



    convertSerialEvents(channel: ScriptChannel): Map<number, string> {
        const result = new Map<number, string>()

        const uartType = channel.channel.type as UartType;

        // events in reverse order
        channel.eventsKvpArray.sort((a, b) => (a.value.time < b.value.time) ? 1 : -1);        

        let nextEventTime = 0;

        for (let i = 0; i < channel.eventsKvpArray.length; i++) {


            const kvp = channel.eventsKvpArray[i];

            const evt = kvp.value as ScriptEvent

            switch (uartType) {
                case UartType.genericSerial:
                    const gse = this.convertGenericSerial(evt);
                    result.set(kvp.key, gse);
                case UartType.genericSerial:
                    const ke = this.convertKangaroo(evt, nextEventTime);
                    result.set(kvp.key, ke);
            }

            nextEventTime = evt.time;
        }

        return result;
    }




    convertGenericSerial(scriptEvent: ScriptEvent): string {
        throw new Error("Function not implemented.");
    }

    // |___|___ ___ ___ ___ ___ ___ ___ ___|
    //  evt ch  cmd spd     pos     time till
    convertKangaroo(scriptEvent: ScriptEvent, nextEventTime: number): string {
        
        let timeTill = 0;

        if (nextEventTime != 0)
        {
            timeTill = nextEventTime - scriptEvent.time;
        } 

        const evt = JSON.parse(scriptEvent.dataJson) as KangarooEvent;


        if (evt.ch1Action != KangarooAction.none){
            const byteArray = [commandType.kangaroo, , 0, 0, 0, 0, 0, 0];
        }
        if (evt.ch2Action != KangarooAction.none){
            const byteArray = [commandType.kangaroo, , 0, 0, 0, 0, 0, 0];
        }
    }
}

