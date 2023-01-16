import { ServoEvent, I2cEvent, ChannelSubType } from "astros-common";
import { ChannelType, ControllerType,
    KangarooAction, KangarooEvent, Script, 
    ScriptChannel, ScriptEvent, GenericSerialEvent } from "astros-common";
import { logger } from "./logger";


export enum CommandType {
    none,
    servo,
    i2c,
    genericSerial,
    kangaroo
}

export class ScriptConverter {


    convertScript(script: Script): Map<ControllerType, string> {
        try {
            const result = new Map<ControllerType, string>();
            const eventMap = new Map<ControllerType, Map<number, Array<ScriptEvent>>>();
            
            for (const ch of script.scriptChannels){
                this.mapEventsByControllerAndTime(ch, eventMap);
            }

            for (const ctl of eventMap.keys()){
                const map = eventMap.get(ctl);
                if (map !== undefined){
                    const scriptString = this.convertScriptEvents(map);
                    result.set(ctl, scriptString);
                }
            }

            return result;
        }  
        catch (err) {
            logger.error(`Exception converting script${script.id}: ${err}`)
            return new Map<ControllerType, string>();
        }
    }

    mapEventsByControllerAndTime(channel: ScriptChannel, map: Map<ControllerType, Map<number, Array<ScriptEvent>>>) : void {
        
        for (const kvp of channel.eventsKvpArray){
            const evt = kvp.value as ScriptEvent;

            // convert from 10ths of a second to ms
            evt.time = evt.time * 100;

            if (map.has(channel.controllerType)){
                if (map.get(channel.controllerType)?.has(evt.time)){
                    map.get(channel.controllerType)?.get(evt.time)?.push(evt);
                } else {
                    map.get(channel.controllerType)?.set(evt.time, new Array<ScriptEvent>());
                    map.get(channel.controllerType)?.get(evt.time)?.push(evt);
                }
            } else {
                map.set(channel.controllerType, new Map<number, Array<ScriptEvent>>());
                map.get(channel.controllerType)?.set(evt.time, new Array<ScriptEvent>());
                map.get(channel.controllerType)?.get(evt.time)?.push(evt);
            }
        }
    } 

    convertScriptEvents(timeMap: Map<number, Array<ScriptEvent>>) : string {
        
        let script = ''; 
        
        const times = Array.from( timeMap.keys() );

        // sort event times
        const sortedTimes = times.sort((n1,n2) => n1 - n2);

        let nextEventTime = 0;

        // starting with the last event, work backwards so we  
        // properly set the delay till next event
        for (let i = sortedTimes.length - 1; i >= 0; i--){

            const events = timeMap.get(sortedTimes[i]);

            if (events?.length === undefined || events?.length < 1){
                continue;
            }
             
            // calculate the time to delay until the next set of events
            const timeTill = Math.max(0, nextEventTime - events[0].time)

            for (let j = 0; j < events.length; j++){

                // if there are more events at this time only 
                // add the time till next on the first event added
                const timeToSend = j === 0 ? timeTill : 0;

                const event = events[j];
                switch (event.channelType){
                    case ChannelType.uart:
                        script = this.convertUartEvent(event, timeToSend) + script;
                        break;
                    case ChannelType.servo:
                        script = this.convertServoEvent(event, timeToSend) + script
                        break;
                    case ChannelType.i2c:
                        script = this.convertI2cEvent(event, timeToSend) + script
                        break
                    case ChannelType.audio:
                        break
                }
            }
            
            nextEventTime = sortedTimes[i];
        }

        return script;
    }



    convertUartEvent(evt: ScriptEvent, timeTillNextEvent: number) : string {
        switch (evt.channelSubType){
            case ChannelSubType.genericSerial:
                return this.convertGenericSerialEvent(evt, timeTillNextEvent);
            case ChannelSubType.kangaroo:
                return this.convertKangarooEvent(evt, timeTillNextEvent);
            default:
                logger.warn('ScriptConverter: invalid subtype')
        }

        return '';
    }

    // |___|_________|___________;
    //  evt time_till msg 
    convertGenericSerialEvent(evt: ScriptEvent, timeTillNextEvent: number) : string {
        const serial = JSON.parse(evt.dataJson) as GenericSerialEvent;

        return `${CommandType.genericSerial}|${timeTillNextEvent}|${serial.value};`;
    }

    // |___|_________|___|____|____|____;
    //  evt time_till ch  cmd  spd  pos  
    convertKangarooEvent(evt: ScriptEvent, timeTillNextEvent: number) : string {
        
        let command = '';
        
        const kangaroo = JSON.parse(evt.dataJson) as KangarooEvent;

        if (kangaroo.ch1Action != KangarooAction.none) {
            const evtTime =  kangaroo.ch2Action === KangarooAction.none ? timeTillNextEvent : 0;

            command = `${CommandType.kangaroo}|${evtTime}|${1}|${kangaroo.ch1Action}|${kangaroo.ch1Speed}|${kangaroo.ch1Position};`;
                //this.convertChannelEvent(1, evt.ch1Action, evt.ch1Speed, evt.ch1Position,
                // if the ch2 action is none, use timeTill. Otherwise we have 2 actions for the
                // same time period, so don't delay untill after second action is done.
        }
        if (kangaroo.ch2Action != KangarooAction.none) {
            command = command + `${CommandType.kangaroo}|${timeTillNextEvent}|${2}|${kangaroo.ch2Action}|${kangaroo.ch2Speed}|${kangaroo.ch2Position};`;
            //this.convertChannelEvent(2, evt.ch2Action, evt.ch2Speed, evt.ch2Position, timeTill);
        }

        return command;
    }

    // |___|_________|___|____|____;
    //  evt time_till ch  spd  pos  
    convertServoEvent(evt: ScriptEvent, timeTillNextEvent: number) : string {
        const servo = JSON.parse(evt.dataJson) as ServoEvent;

        return `${CommandType.servo}|${timeTillNextEvent}|${servo.channelId}|${servo.position}|${servo.speed};`;
    }

    // |___|_________|___|________;
    //  evt time_till ch   msg 
    convertI2cEvent(evt: ScriptEvent, timeTillNextEvent: number) : string {
        const i2c = JSON.parse(evt.dataJson) as I2cEvent;
    
        return `${CommandType.i2c}|${timeTillNextEvent}|${i2c.channelId}|${i2c.message};`;
    }
}

