import {
    ServoEvent,
    I2cEvent,
    ChannelSubType,
    HumanCyborgRelationsEvent,
    humanCyborgRelationsController,
    KangarooAction,
    KangarooEvent,
    Script,
    ScriptChannel,
    ScriptEvent,
    GenericSerialEvent,
    GpioEvent,
    ChannelType
} from "astros-common";

import { logger } from "./logger";

export enum CommandType {
    none,
    servo,
    i2c,
    genericSerial,
    kangaroo,
    gpio
}

export class ScriptConverter {


    convertScript(script: Script): Map<number, string> {
        try {
            const result = new Map<number, string>();
            const eventMap = new Map<number, Map<number, Array<ScriptEvent>>>();

            for (const ch of script.scriptChannels) {
                this.mapEventsByControllerAndTime(ch, eventMap);
            }

            for (const ctl of eventMap.keys()) {
                const map = eventMap.get(ctl);
                if (map !== undefined) {
                    const scriptString = this.convertScriptEvents(map);
                    result.set(ctl, scriptString);
                }
            }

            return result;
        }
        catch (err) {
            logger.error(`Exception converting script${script.id}: ${err}`)
            return new Map<number, string>();
        }
    }

    convertCommand(command: any): string {

        let script = '';

        switch (command.channelType) {
            case ChannelType.uart:
                script = this.convertUartEvent(command.event, 0);
                break;
            case ChannelType.servo:
                script = this.convertServoEvent(command.event, 0);
                break;
            case ChannelType.i2c:
                script = this.convertI2cEvent(command.event, 0);
                break;
            case ChannelType.audio:
                break;
            case ChannelType.gpio:
                script = this.convertGpioEvent(command.event, 0);
                break;
        }

        return script;
    }

    mapEventsByControllerAndTime(channel: ScriptChannel, map: Map<number, Map<number, Array<ScriptEvent>>>): void {

        for (const kvp of channel.eventsKvpArray) {
            const evt = kvp.value as ScriptEvent;

            // convert from 10ths of a second to ms
            evt.time = evt.time * 100;

            if (map.has(channel.locationId)) {
                if (map.get(channel.locationId)?.has(evt.time)) {
                    map.get(channel.locationId)?.get(evt.time)?.push(evt);
                } else {
                    map.get(channel.locationId)?.set(evt.time, new Array<ScriptEvent>());
                    map.get(channel.locationId)?.get(evt.time)?.push(evt);
                }
            } else {
                map.set(channel.locationId, new Map<number, Array<ScriptEvent>>());
                map.get(channel.locationId)?.set(evt.time, new Array<ScriptEvent>());
                map.get(channel.locationId)?.get(evt.time)?.push(evt);
            }
        }
    }

    convertScriptEvents(timeMap: Map<number, Array<ScriptEvent>>): string {

        let script = '';

        const times = Array.from(timeMap.keys());

        // sort event times
        const sortedTimes = times.sort((n1, n2) => n1 - n2);

        let nextEventTime = 0;

        // starting with the last event, work backwards so we  
        // properly set the delay till next event
        for (let i = sortedTimes.length - 1; i >= 0; i--) {

            const events = timeMap.get(sortedTimes[i]);

            if (events?.length === undefined || events?.length < 1) {
                continue;
            }

            // calculate the time to delay until the next set of events
            const timeTill = Math.max(0, nextEventTime - events[0].time)

            for (let j = 0; j < events.length; j++) {

                // if there are more events at this time only 
                // add the time till next on the first event added
                const timeToSend = j === 0 ? timeTill : 0;

                const event = events[j];
                switch (event.channelType) {
                    case ChannelType.uart:
                        script = this.convertUartEvent(event, timeToSend) + script;
                        break;
                    case ChannelType.servo:
                        script = this.convertServoEvent(event, timeToSend) + script;
                        break;
                    case ChannelType.i2c:
                        script = this.convertI2cEvent(event, timeToSend) + script;
                        break;
                    case ChannelType.audio:
                        break;
                    case ChannelType.gpio:
                        script = this.convertGpioEvent(event, timeToSend) + script;
                        break;
                }
            }

            nextEventTime = sortedTimes[i];
        }

        return script;
    }



    convertUartEvent(evt: ScriptEvent, timeTillNextEvent: number): string {
        switch (evt.channelSubType) {
            case ChannelSubType.genericSerial:
                return this.convertGenericSerialEvent(evt, timeTillNextEvent);
            case ChannelSubType.humanCyborgRelations:
                return this.convertHcrEvent(evt, timeTillNextEvent);
            case ChannelSubType.kangaroo:
                return this.convertKangarooEvent(evt, timeTillNextEvent);
            default:
                logger.warn('ScriptConverter: invalid subtype')
        }

        return '';
    }

    // |___|_________|___________|___________;
    //  evt time_till serial ch   msg 
    convertGenericSerialEvent(evt: ScriptEvent, timeTillNextEvent: number): string {
        const serial = JSON.parse(evt.dataJson) as GenericSerialEvent;

        return `${CommandType.genericSerial}|${timeTillNextEvent}|${serial.uartChannel}|${serial.value};`;
    }

    // |___|_________|___________|___________;
    //  evt time_till serial ch   msg 
    convertHcrEvent(evt: ScriptEvent, timeTillNextEvent: number): string {

        const hcr = JSON.parse(evt.dataJson) as HumanCyborgRelationsEvent;

        let val = '<';

        for (const cmd of hcr.commands) {

            if (cmd.valueA === null || cmd.valueA === undefined) {
                cmd.valueA = 0;
            }

            if (cmd.valueB === null || cmd.valueB === undefined) {
                cmd.valueB = 0;
            }

            let cmdS = humanCyborgRelationsController.getCommandString(cmd.command);
            let re = /#/;
            cmdS = cmdS.replace(re, cmd.valueA.toString());
            re = /\*/;
            cmdS = cmdS.replace(re, cmd.valueB.toString());
            val += cmdS + ',';
        }

        val = val.slice(0, -1)

        val += '>';

        return `${CommandType.genericSerial}|${timeTillNextEvent}|${hcr.uartChannel}|${val};`;
    }

    // |___|_________|__________|___|____|____|____;
    //  evt time_till serial ch  ch  cmd  spd  pos  
    convertKangarooEvent(evt: ScriptEvent, timeTillNextEvent: number): string {

        let command = '';

        const kangaroo = JSON.parse(evt.dataJson) as KangarooEvent;

        if (kangaroo.ch1Action != KangarooAction.none) {
            const evtTime = kangaroo.ch2Action === KangarooAction.none ? timeTillNextEvent : 0;

            command = `${CommandType.kangaroo}|${evtTime}|${kangaroo.uartChannel}|${1}|${kangaroo.ch1Action}|${kangaroo.ch1Speed}|${kangaroo.ch1Position};`;
            //this.convertChannelEvent(1, evt.ch1Action, evt.ch1Speed, evt.ch1Position,
            // if the ch2 action is none, use timeTill. Otherwise we have 2 actions for the
            // same time period, so don't delay untill after second action is done.
        }
        if (kangaroo.ch2Action != KangarooAction.none) {
            command = command + `${CommandType.kangaroo}|${timeTillNextEvent}|${kangaroo.uartChannel}|${2}|${kangaroo.ch2Action}|${kangaroo.ch2Speed}|${kangaroo.ch2Position};`;
            //this.convertChannelEvent(2, evt.ch2Action, evt.ch2Speed, evt.ch2Position, timeTill);
        }

        return command;
    }

    // |___|_________|___|____|____;
    //  evt time_till ch  spd  pos  
    convertServoEvent(evt: ScriptEvent, timeTillNextEvent: number): string {
        const servo = JSON.parse(evt.dataJson) as ServoEvent;

        return `${CommandType.servo}|${timeTillNextEvent}|${servo.channelId}|${servo.position}|${servo.speed};`;
    }

    // |___|_________|___|________;
    //  evt time_till ch   msg 
    convertI2cEvent(evt: ScriptEvent, timeTillNextEvent: number): string {
        const i2c = JSON.parse(evt.dataJson) as I2cEvent;

        return `${CommandType.i2c}|${timeTillNextEvent}|${i2c.channelId}|${i2c.message};`;
    }

    // |___|_________|___|____;
    //  evt time_till ch  val
    convertGpioEvent(evt: ScriptEvent, timeTillNextEvent: number): string {
        const gpio = JSON.parse(evt.dataJson) as GpioEvent;

        return `${CommandType.gpio}|${timeTillNextEvent}|${gpio.channelId}|${gpio.setHigh ? 1 : 0};`;
    }
}

