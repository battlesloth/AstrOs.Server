import { 
    ChannelSubType, 
    ChannelType, 
    GenericSerialEvent, 
    GpioEvent, 
    HumanCyborgRelationsEvent, 
    I2cEvent, 
    KangarooAction, 
    KangarooEvent, 
    ScriptEvent
} from "astros-common";

export default class EventMarkerHelper {
    static generateText(event: ScriptEvent): Array<string> {

        switch (event.channelType) {
            case ChannelType.audio:
                const rAudio = new Array<string>();
                rAudio[0] = '\u00A0';
                rAudio[1] = 'Audio Track'
                rAudio[2] = '';
                rAudio[3] = '';
                return rAudio;
            //case ChannelType.servo:
            //    return this.servoText(event.dataJson);
            case ChannelType.i2c:
                return this.i2cText(event.dataJson);
            case ChannelType.gpio:
                return this.gpioText(event.dataJson);
            case ChannelType.uart:
                return this.uartText(event.channelSubType, event.dataJson);
            default:
                const rDefault = new Array<string>();
                rDefault[0] = '\u00A0';
                rDefault[1] = 'error'
                rDefault[2] = '';
                rDefault[3] = '';
                return rDefault;

        }
    }


    /*private static servoText(json: string): Array<string> {
        const evt = JSON.parse(json) as ServoEvent;
        const result = new Array<string>();
        result[0] = 'Position:';
        result[1] = evt.position.toString();
        result[2] = 'Speed:';
        result[3] = evt.speed.toString();

        return result;
    }*/

    private static i2cText(json: string): Array<string> {
        const evt = JSON.parse(json) as I2cEvent;
        const result = new Array<string>();
        result[0] = '\u00A0';
        result[1] = 'Message:'
        result[2] = evt.message;
        result[3] = '';

        return result
    }

    private static gpioText(json: string): Array<string> {
        const evt = JSON.parse(json) as GpioEvent;
        const result = new Array<string>();
        result[0] = '\u00A0';
        result[1] = 'State:';
        result[2] = evt.setHigh ? 'High' : 'Low';
        result[3] = '';

        return result
    }

    private static uartText(subType: ChannelSubType, json: string): Array<string> {

        switch (subType) {
            case ChannelSubType.genericSerial:
                return this.genericUart(json);
            case ChannelSubType.kangaroo:
                return this.kangaroo(json);
            case ChannelSubType.humanCyborgRelations:
                return this.humanCyborg(json);
            default:
                const result = new Array<string>();
                result[0] = '\u00A0';
                result[1] = 'error'
                result[2] = '';
                result[3] = '';
                return result;
        }
    }

    private static genericUart(json: string): Array<string> {
        const evt = JSON.parse(json) as GenericSerialEvent;
        const result = new Array<string>();
        result[0] = '\u00A0';
        result[1] = 'Message:';
        result[2] = evt.value;
        result[3] = '';

        return result
    }

    static kangaroo(json: string): Array<string> {
        const evt = JSON.parse(json) as KangarooEvent;
        const result = new Array<string>();
        result[0] = 'CH 1:';
        result[1] = this.getKangarooActionName(evt.ch1Action);
        result[2] = 'CH 2:';
        result[3] = this.getKangarooActionName(evt.ch2Action);

        return result
    }

    static getKangarooActionName(action: KangarooAction): string {
        switch (action) {
            case KangarooAction.start:
                return 'Start';
            case KangarooAction.home:
                return 'Home';
            case KangarooAction.position:
                return 'Position';
            case KangarooAction.speed:
                return 'Speed';
            case KangarooAction.none:
                return 'None';
            default:
                return 'error';
        }
    }

    static humanCyborg(json: string): Array<string> {
        const evt = JSON.parse(json) as HumanCyborgRelationsEvent;
        const result = new Array<string>();
        result[0] = '';
        result[1] = 'Event Count';
        result[2] = evt.commands.length.toString();
        result[3] = '';

        return result;
    }
}



