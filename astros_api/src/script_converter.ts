import { ServoEvent, I2cEvent, ChannelSubType } from "astros-common";
import { ChannelType, ControllerType,
    KangarooAction, KangarooEvent, Script, 
    ScriptChannel, ScriptEvent, GenericSerialEvent } from "astros-common";


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
            console.log(`Exception converting script${script.id}: ${err}`)
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
                console.log('ScriptConverter: invalid subtype')
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

    /*
    convertScript(script: Script): Map<ControllerType, string> {

        try {
            const result = new Map<ControllerType, string>();

            const channelMap = new Map<ControllerType, Array<Kvp>>();

            channelMap.set(ControllerType.core, new Array<Kvp>());
            channelMap.set(ControllerType.dome, new Array<Kvp>());
            channelMap.set(ControllerType.body, new Array<Kvp>());

            for (const ch of script.scriptChannels) {

                // convert time to 100 ms
                ch.eventsKvpArray.forEach(x => x.value.time = x.value.time * 100);

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
                return this.convertI2cEvents(channel);
            case ChannelType.servo:
                return this.convertServoEvents(channel);
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

    // |___|_________|___|____|____|____;
    //  evt time_till ch  cmd  spd  pos  
    convertKangaroo(scriptEvent: ScriptEvent, nextEventTime: number): string {

        let command = '';

        let timeTill = 0;

        if (nextEventTime != 0) {
            timeTill = nextEventTime - scriptEvent.time;
        }

        const evt = JSON.parse(scriptEvent.dataJson) as KangarooEvent;

        if (evt.ch1Action != KangarooAction.none) {
            const evtTime =  evt.ch2Action === KangarooAction.none ? timeTill : 0;

            command = `${CommandType.kangaroo}|${evtTime}|${1}|${evt.ch1Action}|${evt.ch1Speed}|${evt.ch1Position};`;
                //this.convertChannelEvent(1, evt.ch1Action, evt.ch1Speed, evt.ch1Position,
                // if the ch2 action is none, use timeTill. Otherwise we have 2 actions for the
                // same time period, so don't delay untill after second action is done.
        }
        if (evt.ch2Action != KangarooAction.none) {
            command = command + `${CommandType.kangaroo}|${timeTill}|${2}|${evt.ch2Action}|${evt.ch2Speed}|${evt.ch2Position};`;
            //this.convertChannelEvent(2, evt.ch2Action, evt.ch2Speed, evt.ch2Position, timeTill);
        }

        return command;
    }

    // |___|_________|___|____|____;
    //  evt time_till ch  spd  pos  
    convertServoEvents(channel: ScriptChannel): Array<Kvp> {
        const result = new Array<Kvp>()
        // events in reverse order
        channel.eventsKvpArray.sort((a: any, b: any) => (a.value.time < b.value.time) ? 1 : -1);

        let nextEventTime = 0;

        for (let i = 0; i < channel.eventsKvpArray.length; i++) {

            const kvp = channel.eventsKvpArray[i];

            const evt = kvp.value as ScriptEvent

            let command = '';

            let timeTill = 0;
    
            if (nextEventTime != 0) {
                timeTill = nextEventTime - evt.time;
            }
    
            const servo = JSON.parse(evt.dataJson) as ServoEvent;
    
            command = `${CommandType.servo}|${timeTill}|${servo.channelId}|${servo.position}|${servo.speed};`;

            if (command.length > 0) {
                result.push(new Kvp(kvp.key, command));
            }

            nextEventTime = evt.time;
        }

        return result;
    }

     // |___|_________|___|________;
    //  evt time_till ch   msg 
    convertI2cEvents(channel: ScriptChannel): Array<Kvp> {
        const result = new Array<Kvp>()
        // events in reverse order
        channel.eventsKvpArray.sort((a: any, b: any) => (a.value.time < b.value.time) ? 1 : -1);

        let nextEventTime = 0;

        for (let i = 0; i < channel.eventsKvpArray.length; i++) {

            const kvp = channel.eventsKvpArray[i];

            const evt = kvp.value as ScriptEvent

            let command = '';

            let timeTill = 0;
    
            if (nextEventTime != 0) {
                timeTill = nextEventTime - evt.time;
            }
    
            const i2c = JSON.parse(evt.dataJson) as I2cEvent;
    
            command = `${CommandType.i2c}|${timeTill}|${i2c.channelId}|${i2c.message};`;

            if (command.length > 0) {
                result.push(new Kvp(kvp.key, command));
            }

            nextEventTime = evt.time;
        }

        return result;
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
    */
}

