
import {
    ChannelType, ControllerType, KangarooController,
    UartModule, UartType, KangarooAction, KangarooEvent,
    Script, ScriptChannel, ScriptEvent, ServoModule, ServoEvent, ChannelSubType, ServoChannel
} from "astros-common";
import exp from "constants";
import { ScriptConverter, CommandType } from "../src/script_converter";

function generateKangarooEvent(time: number, ch1Action: KangarooAction, ch1Speed: number, ch1Position: number,
    ch2Action: KangarooAction, ch2Speed: number, ch2Position: number) {

    const data = new KangarooEvent(ch1Action, ch1Speed, ch1Position, ch2Action, ch2Speed, ch2Position)

    return { key: time, value: new ScriptEvent("", ChannelType.uart, ChannelSubType.kangaroo, time, JSON.stringify(data)) };
}

function generateServoEvent(time: number, channel: number, position: number, speed: number) {

    const data = new ServoEvent(channel, position, speed);

    return { key: time, value: new ScriptEvent("", ChannelType.servo, ChannelSubType.none, time, JSON.stringify(data)) };
}


const _type = 0;
const _time = 1;
const _serialCh = 2;

    // |___|_________|__________|___|____|____|____;
    //  evt time_till serial ch  ch  cmd  spd  pos  

const _kChannel = 3;
const _kCommand = 4;
const _kSpd = 5;
const _kPos = 6;

const _servoChannel = 2;
const _servoPosition = 3;
const _servoSpeed = 4;



describe("Script Converter Tests", () => {
    it("kanagroo test", ()=>{
        const script = new Script("1234", "test1",
        "desc1", "1970-01-01 00:00:00.000",
        "1970-01-01 00:00:00.000",
        "1970-01-01 00:00:00.000",
        "1970-01-01 00:00:00.000");

    const kanagrooCh = new UartModule(UartType.kangaroo, "Periscope", new KangarooController({channelOneName: "ch1 test", channelTwoName: "ch2 test"}));
   
    const channelOne = new ScriptChannel("one", ControllerType.core, "core", ChannelType.servo, ChannelSubType.none, 0, kanagrooCh, 3000);
   
    channelOne.eventsKvpArray.push(generateKangarooEvent(0, KangarooAction.start, 0, 0, KangarooAction.start, 0, 0,));

    channelOne.eventsKvpArray.push(generateKangarooEvent(10, KangarooAction.home, 0, 0, KangarooAction.home, 0, 0));

    channelOne.eventsKvpArray.push(generateKangarooEvent(20, KangarooAction.position, 100, 1000, KangarooAction.speed, 200, 0));

    channelOne.eventsKvpArray.push(generateKangarooEvent(30, KangarooAction.none, 0, 0, KangarooAction.position, 300, 500));

    channelOne.eventsKvpArray.push(generateKangarooEvent(40, KangarooAction.speed, 400, 0, KangarooAction.none, 0, 0));


    script.scriptChannels = new Array<ScriptChannel>(channelOne);

    const cvtr = new ScriptConverter();

    const result = cvtr.convertScript(script);

    expect(result?.size).toBe(1);
    expect(result?.get(ControllerType.core)?.length).toBeGreaterThan(0);

    const coreVal = result?.get(ControllerType.core);

    const evts = Array<Array<string>>();

    const segs = coreVal?.slice(0,-1).split(';');

    segs?.forEach(e => {
        evts.push(e.split('|'));
    });

    expect(evts.length).toBe(8);

    expect(parseInt(evts[0][_type])).toBe(CommandType.kangaroo);
    expect(parseInt(evts[0][_time])).toBe(0);
    expect(parseInt(evts[0][_kChannel])).toBe(1);
    expect(parseInt(evts[0][_kCommand])).toBe(KangarooAction.start);
    expect(parseInt(evts[0][_kSpd])).toBe(0);
    expect(parseInt(evts[0][_kPos])).toBe(0);

    expect(parseInt(evts[1][_type])).toBe(CommandType.kangaroo);
    expect(parseInt(evts[1][_time])).toBe(1000);
    expect(parseInt(evts[1][_kChannel])).toBe(2);
    expect(parseInt(evts[1][_kCommand])).toBe(KangarooAction.start);
    expect(parseInt(evts[1][_kSpd])).toBe(0);
    expect(parseInt(evts[1][_kPos])).toBe(0);
     
    expect(parseInt(evts[2][_type])).toBe(CommandType.kangaroo);
    expect(parseInt(evts[2][_time])).toBe(0);
    expect(parseInt(evts[2][_kChannel])).toBe(1);
    expect(parseInt(evts[2][_kCommand])).toBe(KangarooAction.home);
    expect(parseInt(evts[2][_kSpd])).toBe(0);
    expect(parseInt(evts[2][_kPos])).toBe(0);

    expect(parseInt(evts[3][_type])).toBe(CommandType.kangaroo);
    expect(parseInt(evts[3][_time])).toBe(1000);
    expect(parseInt(evts[3][_kChannel])).toBe(2);
    expect(parseInt(evts[3][_kCommand])).toBe(KangarooAction.home);
    expect(parseInt(evts[3][_kSpd])).toBe(0);
    expect(parseInt(evts[3][_kPos])).toBe(0);

    expect(parseInt(evts[4][_type])).toBe(CommandType.kangaroo);
    expect(parseInt(evts[4][_time])).toBe(0);
    expect(parseInt(evts[4][_kChannel])).toBe(1);
    expect(parseInt(evts[4][_kCommand])).toBe(KangarooAction.position);
    expect(parseInt(evts[4][_kSpd])).toBe(100);
    expect(parseInt(evts[4][_kPos])).toBe(1000);

    expect(parseInt(evts[5][_type])).toBe(CommandType.kangaroo);
    expect(parseInt(evts[5][_time])).toBe(1000);
    expect(parseInt(evts[5][_kChannel])).toBe(2);
    expect(parseInt(evts[5][_kCommand])).toBe(KangarooAction.speed);
    expect(parseInt(evts[5][_kSpd])).toBe(200);
    expect(parseInt(evts[5][_kPos])).toBe(0);

    expect(parseInt(evts[6][_type])).toBe(CommandType.kangaroo);
    expect(parseInt(evts[6][_time])).toBe(1000);
    expect(parseInt(evts[6][_kChannel])).toBe(2);
    expect(parseInt(evts[6][_kCommand])).toBe(KangarooAction.position);
    expect(parseInt(evts[6][_kSpd])).toBe(300);
    expect(parseInt(evts[6][_kPos])).toBe(500);

    expect(parseInt(evts[7][_type])).toBe(CommandType.kangaroo);
    expect(parseInt(evts[7][_time])).toBe(0);
    expect(parseInt(evts[7][_kChannel])).toBe(1);
    expect(parseInt(evts[7][_kCommand])).toBe(KangarooAction.speed);
    expect(parseInt(evts[7][_kSpd])).toBe(400);
    expect(parseInt(evts[7][_kPos])).toBe(0);


    }),

    it("multi channel test", () => {

        const script = new Script("1234", "test1",
            "desc1", "1970-01-01 00:00:00.000",
            "1970-01-01 00:00:00.000",
            "1970-01-01 00:00:00.000",
            "1970-01-01 00:00:00.000");

        const servoCh0 = new ServoChannel(0, "ch0", true, 500, 2500, false);
        const servoCh10 = new ServoChannel(10, "ch10", true, 500, 2500, false);
        const servoCh20 = new ServoChannel(20, "ch20", true, 500, 2500, false);

        const channelOne = new ScriptChannel("one", ControllerType.core, "core", ChannelType.servo, ChannelSubType.none, 0, servoCh0, 3000);
        const channelTen = new ScriptChannel("two", ControllerType.core, "core", ChannelType.servo, ChannelSubType.none, 0, servoCh10, 3000);
        const channelTwenty = new ScriptChannel("three", ControllerType.core, "core", ChannelType.servo, ChannelSubType.none, 0, servoCh20, 3000);


        // move to 50, speed 1, at same time, then delay 1 second
        channelOne.eventsKvpArray.push(generateServoEvent(0, 0, 50, 1));
        channelTen.eventsKvpArray.push(generateServoEvent(0, 10, 50, 1));
        channelTwenty.eventsKvpArray.push(generateServoEvent(0, 20, 50, 1));

        // move to 100, speed 3, with a 1 second delay
        channelOne.eventsKvpArray.push(generateServoEvent(10, 0, 100, 3));
        channelTen.eventsKvpArray.push(generateServoEvent(20, 10, 100, 3));
        channelTwenty.eventsKvpArray.push(generateServoEvent(30, 20, 100, 3));

        // move to 0 speed 5, at the same time
        channelOne.eventsKvpArray.push(generateServoEvent(40, 0, 0, 5));
        channelTen.eventsKvpArray.push(generateServoEvent(40, 10, 0, 5));
        channelTwenty.eventsKvpArray.push(generateServoEvent(40, 20, 0, 5));

        script.scriptChannels = new Array<ScriptChannel>(channelOne, channelTen, channelTwenty);

        const cvtr = new ScriptConverter();

        const result = cvtr.convertScript(script);

        expect(result?.size).toBe(1);
        expect(result?.get(ControllerType.core)?.length).toBeGreaterThan(0);
       
        const coreVal = result?.get(ControllerType.core);

        const evts = Array<Array<string>>();

        const segs = coreVal?.slice(0,-1).split(';');

        segs?.forEach(e => {
            evts.push(e.split('|'));
        });


        const channels = new Array<string>('0', '10', '20');

        //expect(coreVal).toBe('1|0|0|50|1;1|0|10|50|1;1|1000|20|50|1;1|1000|0|100|3;1|1000|10|100|3;1|1000|20|100|3;1|0|0|0|5;1|0|10|0|5;1|0|20|0|5;');

        expect(evts.length).toBe(9);

        expect(parseInt(evts[0][_type])).toBe(CommandType.servo);
        expect(parseInt(evts[0][_time])).toBe(0);
        expect(channels.findIndex(x => x === evts[0][_servoChannel])).toBeGreaterThan(-1);
        expect(parseInt(evts[0][_servoPosition])).toBe(50);
        expect(parseInt(evts[0][_servoSpeed])).toBe(1);

        expect(parseInt(evts[1][_type])).toBe(CommandType.servo);
        expect(parseInt(evts[1][_time])).toBe(0);
        expect(channels.findIndex(x => x === evts[1][_servoChannel])).toBeGreaterThan(-1);
        expect(parseInt(evts[1][_servoPosition])).toBe(50);
        expect(parseInt(evts[1][_servoSpeed])).toBe(1);

        expect(parseInt(evts[2][_type])).toBe(CommandType.servo);
        expect(parseInt(evts[2][_time])).toBe(1000);
        expect(channels.findIndex(x => x === evts[0][_servoChannel])).toBeGreaterThan(-1);
        expect(parseInt(evts[2][_servoPosition])).toBe(50);
        expect(parseInt(evts[2][_servoSpeed])).toBe(1);

        expect(parseInt(evts[3][_type])).toBe(CommandType.servo);
        expect(parseInt(evts[3][_time])).toBe(1000);
        expect(parseInt(evts[3][_servoChannel])).toBe(0);
        expect(parseInt(evts[3][_servoPosition])).toBe(100);
        expect(parseInt(evts[3][_servoSpeed])).toBe(3);

        expect(parseInt(evts[4][_type])).toBe(CommandType.servo);
        expect(parseInt(evts[4][_time])).toBe(1000);
        expect(parseInt(evts[4][_servoChannel])).toBe(10);
        expect(parseInt(evts[4][_servoPosition])).toBe(100);
        expect(parseInt(evts[4][_servoSpeed])).toBe(3);

        expect(parseInt(evts[5][_type])).toBe(CommandType.servo);
        expect(parseInt(evts[5][_time])).toBe(1000);
        expect(parseInt(evts[5][_servoChannel])).toBe(20);
        expect(parseInt(evts[5][_servoPosition])).toBe(100);
        expect(parseInt(evts[5][_servoSpeed])).toBe(3);

        
        expect(parseInt(evts[6][_type])).toBe(CommandType.servo);
        expect(parseInt(evts[6][_time])).toBe(0);
        expect(channels.findIndex(x => x === evts[6][_servoChannel])).toBeGreaterThan(-1);
        expect(parseInt(evts[6][_servoPosition])).toBe(0);
        expect(parseInt(evts[6][_servoSpeed])).toBe(5);

        expect(parseInt(evts[7][_type])).toBe(CommandType.servo);
        expect(parseInt(evts[7][_time])).toBe(0);
        expect(channels.findIndex(x => x === evts[7][_servoChannel])).toBeGreaterThan(-1);
        expect(parseInt(evts[7][_servoPosition])).toBe(0);
        expect(parseInt(evts[7][_servoSpeed])).toBe(5);

        expect(parseInt(evts[8][_type])).toBe(CommandType.servo);
        expect(parseInt(evts[8][_time])).toBe(0);
        expect(channels.findIndex(x => x === evts[8][_servoChannel])).toBeGreaterThan(-1);
        expect(parseInt(evts[8][_servoPosition])).toBe(0);
        expect(parseInt(evts[8][_servoSpeed])).toBe(5);
    });
})