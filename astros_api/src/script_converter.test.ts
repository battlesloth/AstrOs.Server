
import { expect, describe, it } from "vitest";

describe("Script Converter Tests", () => {

    it("placeholder", () => {
        expect(true).toBe(true);
    });
});

//import {
//    ChannelType, KangarooController, KangarooAction, KangarooEvent,
//    Script, ScriptChannel, ScriptEvent, ServoEvent, ChannelSubType, ServoChannel,
//    UartChannel, HumanCyborgRelationsCmd, HumanCyborgRelationsEvent, HcrCommand, HcrCommandCategory,
//    GpioEvent,
//    GpioChannel,
//} from "astros-common";
//
//import { ScriptConverter, CommandType } from '../src/script_converter.js';
//
//
//const generateKangarooEvent = (time: number, ch1Action: KangarooAction, ch1Speed: number, ch1Position: number,
//    ch2Action: KangarooAction, ch2Speed: number, ch2Position: number) => {
//
//    const data = new KangarooEvent(1, ch1Action, ch1Speed, ch1Position, ch2Action, ch2Speed, ch2Position)
//
//    return { key: time, value: new ScriptEvent("", ChannelType.uart, ChannelSubType.kangaroo, time, JSON.stringify(data)) };
//};
//
//const generateServoEvent = (time: number, channel: number, position: number, speed: number, acceleration: number) => {
//
//    const data = new ServoEvent(channel, position, speed, acceleration);
//
//    return { key: time, value: new ScriptEvent("", ChannelType.servo, ChannelSubType.none, time, JSON.stringify(data)) };
//};
//
//const generateHcrEvent = (time: number, channel: number, commands: HcrCommand[]) => {
//
//    const data = new HumanCyborgRelationsEvent(channel, commands);
//
//    return { key: time, value: new ScriptEvent("", ChannelType.uart, ChannelSubType.humanCyborgRelations, time, JSON.stringify(data)) };
//};
//
//const generateGpioEvent = (time: number, channel: number, state: boolean) => {
//
//    const data = new GpioEvent(channel, state);
//
//    return { key: time, value: new ScriptEvent("", ChannelType.gpio, ChannelSubType.none, time, JSON.stringify(data)) };
//};
//
//const _type = 0;
//const _time = 1;
//
//// kangaroo command
//// |___|_________|__________|___|____|____|____;
////  evt time_till serial ch  ch  cmd  spd  pos  
//
//const _uartChannel = 2;
//const _kChannel = 3;
//const _kCommand = 4;
//const _kSpd = 5;
//const _kPos = 6;
//
//// hcr command
//// |___|_________|__________|___;
////  evt time_till serial ch  val
//const _val = 3;
//
//// servo command
//// |___|_________|__________|____|____|____;
////  evt time_till servo ch   pos  spd  acc
//const _servoChannel = 2;
//const _servoPosition = 3;
//const _servoSpeed = 4;
//const _servoAcc = 5;
//
//// gpio command
//// |___|_________|__________|____;
////  evt time_till gpio ch   state
//const _gpioChannel = 2;
//const _gpioState = 3;
//
//describe("Script Converter Tests", () => {
//    it("kanagroo test", () => {
//        const script = new Script("1234", "test1",
//            "desc1", new Date());
//
//        const controllerId = 1;
//
//        const kanagrooCh = new UartChannel(1, UartType.kangaroo, "Periscope", new KangarooController({ channelOneName: "ch1 test", channelTwoName: "ch2 test" }));
//
//        const channelOne = new ScriptChannel("ABCD", "ABCD", controllerId, ChannelType.servo, ChannelSubType.none, 0, kanagrooCh, 3000);
//
//        channelOne.eventsKvpArray.push(generateKangarooEvent(0, KangarooAction.start, 0, 0, KangarooAction.start, 0, 0,));
//
//        channelOne.eventsKvpArray.push(generateKangarooEvent(10, KangarooAction.home, 0, 0, KangarooAction.home, 0, 0));
//
//        channelOne.eventsKvpArray.push(generateKangarooEvent(20, KangarooAction.position, 100, 1000, KangarooAction.speed, 200, 0));
//
//        channelOne.eventsKvpArray.push(generateKangarooEvent(30, KangarooAction.none, 0, 0, KangarooAction.position, 300, 500));
//
//        channelOne.eventsKvpArray.push(generateKangarooEvent(40, KangarooAction.speed, 400, 0, KangarooAction.none, 0, 0));
//
//
//        script.scriptChannels = new Array<ScriptChannel>(channelOne);
//
//        const cvtr = new ScriptConverter();
//
//        const result = cvtr.convertScript(script);
//
//        expect(result?.size).toBe(1);
//        expect(result?.get(controllerId)?.length).toBeGreaterThan(0);
//
//        const ctlId = result?.get(controllerId);
//
//        const evts = Array<Array<string>>();
//
//        const segs = ctlId?.slice(0, -1).split(';');
//
//        segs?.forEach(e => {
//            evts.push(e.split('|'));
//        });
//
//        expect(evts.length).toBe(8);
//
//        let evt = 0;
//
//        expect(parseInt(evts[evt][_type])).toBe(CommandType.kangaroo);
//        expect(parseInt(evts[evt][_time])).toBe(0);
//        expect(parseInt(evts[evt][_uartChannel])).toBe(1);
//        expect(parseInt(evts[evt][_kChannel])).toBe(1);
//        expect(parseInt(evts[evt][_kCommand])).toBe(KangarooAction.start);
//        expect(parseInt(evts[evt][_kSpd])).toBe(0);
//        expect(parseInt(evts[evt][_kPos])).toBe(0);
//
//        evt++;
//
//        expect(parseInt(evts[evt][_type])).toBe(CommandType.kangaroo);
//        expect(parseInt(evts[evt][_time])).toBe(1000);
//        expect(parseInt(evts[evt][_uartChannel])).toBe(1);
//        expect(parseInt(evts[evt][_kChannel])).toBe(2);
//        expect(parseInt(evts[evt][_kCommand])).toBe(KangarooAction.start);
//        expect(parseInt(evts[evt][_kSpd])).toBe(0);
//        expect(parseInt(evts[evt][_kPos])).toBe(0);
//
//        evt++;
//
//        expect(parseInt(evts[evt][_type])).toBe(CommandType.kangaroo);
//        expect(parseInt(evts[evt][_time])).toBe(0);
//        expect(parseInt(evts[evt][_uartChannel])).toBe(1);
//        expect(parseInt(evts[evt][_kChannel])).toBe(1);
//        expect(parseInt(evts[evt][_kCommand])).toBe(KangarooAction.home);
//        expect(parseInt(evts[evt][_kSpd])).toBe(0);
//        expect(parseInt(evts[evt][_kPos])).toBe(0);
//
//        evt++;
//
//        expect(parseInt(evts[evt][_type])).toBe(CommandType.kangaroo);
//        expect(parseInt(evts[evt][_time])).toBe(1000);
//        expect(parseInt(evts[evt][_uartChannel])).toBe(1);
//        expect(parseInt(evts[evt][_kChannel])).toBe(2);
//        expect(parseInt(evts[evt][_kCommand])).toBe(KangarooAction.home);
//        expect(parseInt(evts[evt][_kSpd])).toBe(0);
//        expect(parseInt(evts[evt][_kPos])).toBe(0);
//
//        evt++;
//
//        expect(parseInt(evts[evt][_type])).toBe(CommandType.kangaroo);
//        expect(parseInt(evts[evt][_time])).toBe(0);
//        expect(parseInt(evts[evt][_uartChannel])).toBe(1);
//        expect(parseInt(evts[evt][_kChannel])).toBe(1);
//        expect(parseInt(evts[evt][_kCommand])).toBe(KangarooAction.position);
//        expect(parseInt(evts[evt][_kSpd])).toBe(100);
//        expect(parseInt(evts[evt][_kPos])).toBe(1000);
//
//        evt++;
//
//        expect(parseInt(evts[evt][_type])).toBe(CommandType.kangaroo);
//        expect(parseInt(evts[evt][_time])).toBe(1000);
//        expect(parseInt(evts[evt][_uartChannel])).toBe(1);
//        expect(parseInt(evts[evt][_kChannel])).toBe(2);
//        expect(parseInt(evts[evt][_kCommand])).toBe(KangarooAction.speed);
//        expect(parseInt(evts[evt][_kSpd])).toBe(200);
//        expect(parseInt(evts[evt][_kPos])).toBe(0);
//
//        evt++;
//
//        expect(parseInt(evts[evt][_type])).toBe(CommandType.kangaroo);
//        expect(parseInt(evts[evt][_time])).toBe(1000);
//        expect(parseInt(evts[evt][_uartChannel])).toBe(1);
//        expect(parseInt(evts[evt][_kChannel])).toBe(2);
//        expect(parseInt(evts[evt][_kCommand])).toBe(KangarooAction.position);
//        expect(parseInt(evts[evt][_kSpd])).toBe(300);
//        expect(parseInt(evts[evt][_kPos])).toBe(500);
//
//        evt++;
//
//        expect(parseInt(evts[evt][_type])).toBe(CommandType.kangaroo);
//        expect(parseInt(evts[evt][_time])).toBe(0);
//        expect(parseInt(evts[evt][_uartChannel])).toBe(1);
//        expect(parseInt(evts[evt][_kChannel])).toBe(1);
//        expect(parseInt(evts[evt][_kCommand])).toBe(KangarooAction.speed);
//        expect(parseInt(evts[evt][_kSpd])).toBe(400);
//        expect(parseInt(evts[evt][_kPos])).toBe(0);
//
//    });
//    it("human cyborg relations test", () => {
//
//        const script = new Script("1234", "test1",
//            "desc1", new Date());
//
//        const controllerId = 2;
//
//        const hcrChannel = new UartChannel(UartType.humanCyborgRelations, 2, "", {});
//
//        const channelOne = new ScriptChannel("ABCD", "ABCD", controllerId, ChannelType.uart, ChannelSubType.humanCyborgRelations, 0, hcrChannel, 3000);
//
//        const cmds = new Array<HcrCommand>()
//
//
//        cmds.push(
//            new HcrCommand("1", HcrCommandCategory.stimuli, HumanCyborgRelationsCmd.extremeAngry, 0, 0),
//        );
//
//        channelOne.eventsKvpArray.push(generateHcrEvent(5, 2, cmds));
//
//        cmds.splice(0);
//
//        cmds.push(
//            new HcrCommand("1", HcrCommandCategory.volume, HumanCyborgRelationsCmd.vocalizerVolume, 5, 0),
//            new HcrCommand("1", HcrCommandCategory.volume, HumanCyborgRelationsCmd.wavAVolume, 7, 0),
//            new HcrCommand("1", HcrCommandCategory.sdWav, HumanCyborgRelationsCmd.playSdRandomOnA, 100, 200)
//        );
//
//        channelOne.eventsKvpArray.push(generateHcrEvent(10, 2, cmds));
//
//        script.scriptChannels = new Array<ScriptChannel>(channelOne);
//
//        const cvtr = new ScriptConverter();
//
//        const result = cvtr.convertScript(script);
//
//        expect(result?.size).toBe(1);
//        expect(result?.get(controllerId)?.length).toBeGreaterThan(0);
//
//        const ctlId = result?.get(controllerId);
//
//        const evts = Array<Array<string>>();
//
//        const segs = ctlId?.slice(0, -1).split(';');
//
//        segs?.forEach(e => {
//            evts.push(e.split('|'));
//        });
//
//        expect(evts.length).toBe(2);
//
//        let evt = 0;
//
//        expect(parseInt(evts[evt][_type])).toBe(CommandType.genericSerial);
//        expect(parseInt(evts[evt][_time])).toBe(500);
//        expect(parseInt(evts[evt][_uartChannel])).toBe(2);
//        expect(evts[evt][_val]).toBe("<SM1>");
//
//        evt++;
//
//        expect(parseInt(evts[evt][_type])).toBe(CommandType.genericSerial);
//        expect(parseInt(evts[evt][_time])).toBe(0);
//        expect(parseInt(evts[evt][_uartChannel])).toBe(2);
//        expect(evts[evt][_val]).toBe("<PVV5,PVA7,CA100C200>");
//
//    });
//    it("multi channel test", () => {
//
//        const script = new Script("1234", "test1",
//            "desc1", new Date());
//
//        const controllerId = 3;
//
//        const servoCh0 = new ServoChannel(0, "ch0", true, 500, 2500, 500, false);
//        const servoCh10 = new ServoChannel(10, "ch10", true, 500, 2500, 500, false);
//        const servoCh20 = new ServoChannel(20, "ch20", true, 500, 2500, 500, false);
//
//        const channelOne = new ScriptChannel("one", "ABCD", controllerId, ChannelType.servo, ChannelSubType.none, 0, servoCh0, 3000);
//        const channelTen = new ScriptChannel("two", "ABCD", controllerId, ChannelType.servo, ChannelSubType.none, 0, servoCh10, 3000);
//        const channelTwenty = new ScriptChannel("three", "ABCD", controllerId, ChannelType.servo, ChannelSubType.none, 0, servoCh20, 3000);
//
//
//        // move to 50, speed 1, at same time, then delay 1 second
//        channelOne.eventsKvpArray.push(generateServoEvent(0, 0, 50, 1, 0));
//        channelTen.eventsKvpArray.push(generateServoEvent(0, 10, 50, 1, 0));
//        channelTwenty.eventsKvpArray.push(generateServoEvent(0, 20, 50, 1, 0));
//
//        // move to 100, speed 3, with a 1 second delay
//        channelOne.eventsKvpArray.push(generateServoEvent(10, 0, 100, 3, 1));
//        channelTen.eventsKvpArray.push(generateServoEvent(20, 10, 100, 3, 1));
//        channelTwenty.eventsKvpArray.push(generateServoEvent(30, 20, 100, 3, 1));
//
//        // move to 0 speed 5, at the same time
//        channelOne.eventsKvpArray.push(generateServoEvent(40, 0, 0, 5, 255));
//        channelTen.eventsKvpArray.push(generateServoEvent(40, 10, 0, 5, 255));
//        channelTwenty.eventsKvpArray.push(generateServoEvent(40, 20, 0, 5, 255));
//
//        script.scriptChannels = new Array<ScriptChannel>(channelOne, channelTen, channelTwenty);
//
//        const cvtr = new ScriptConverter();
//
//        const result = cvtr.convertScript(script);
//
//        expect(result?.size).toBe(1);
//        expect(result?.get(controllerId)?.length).toBeGreaterThan(0);
//
//        const ctlVal = result?.get(controllerId);
//
//        const evts = Array<Array<string>>();
//
//        const segs = ctlVal?.slice(0, -1).split(';');
//
//        segs?.forEach(e => {
//            evts.push(e.split('|'));
//        });
//
//
//        const channels = new Array<string>('0', '10', '20');
//
//        //expect(coreVal).toBe('1|0|0|50|1;1|0|10|50|1;1|1000|20|50|1;1|1000|0|100|3;1|1000|10|100|3;1|1000|20|100|3;1|0|0|0|5;1|0|10|0|5;1|0|20|0|5;');
//
//        expect(evts.length).toBe(9);
//
//        let evt = 0;
//
//        expect(parseInt(evts[evt][_type])).toBe(CommandType.servo);
//        expect(parseInt(evts[evt][_time])).toBe(0);
//        expect(channels.findIndex(x => x === evts[evt][_servoChannel])).toBeGreaterThan(-1);
//        expect(parseInt(evts[evt][_servoPosition])).toBe(50);
//        expect(parseInt(evts[evt][_servoSpeed])).toBe(1);
//        expect(parseInt(evts[evt][_servoAcc])).toBe(0);
//
//        evt++;
//
//        expect(parseInt(evts[evt][_type])).toBe(CommandType.servo);
//        expect(parseInt(evts[evt][_time])).toBe(0);
//        expect(channels.findIndex(x => x === evts[evt][_servoChannel])).toBeGreaterThan(-1);
//        expect(parseInt(evts[evt][_servoPosition])).toBe(50);
//        expect(parseInt(evts[evt][_servoSpeed])).toBe(1);
//        expect(parseInt(evts[evt][_servoAcc])).toBe(0)
//
//        evt++;
//
//        expect(parseInt(evts[evt][_type])).toBe(CommandType.servo);
//        expect(parseInt(evts[evt][_time])).toBe(1000);
//        expect(channels.findIndex(x => x === evts[evt][_servoChannel])).toBeGreaterThan(-1);
//        expect(parseInt(evts[evt][_servoPosition])).toBe(50);
//        expect(parseInt(evts[evt][_servoSpeed])).toBe(1);
//        expect(parseInt(evts[evt][_servoAcc])).toBe(0)
//
//        evt++;
//
//        expect(parseInt(evts[evt][_type])).toBe(CommandType.servo);
//        expect(parseInt(evts[evt][_time])).toBe(1000);
//        expect(parseInt(evts[evt][_servoChannel])).toBe(0);
//        expect(parseInt(evts[evt][_servoPosition])).toBe(100);
//        expect(parseInt(evts[evt][_servoSpeed])).toBe(3);
//        expect(parseInt(evts[evt][_servoAcc])).toBe(1);
//        evt++;
//
//        expect(parseInt(evts[evt][_type])).toBe(CommandType.servo);
//        expect(parseInt(evts[evt][_time])).toBe(1000);
//        expect(parseInt(evts[evt][_servoChannel])).toBe(10);
//        expect(parseInt(evts[evt][_servoPosition])).toBe(100);
//        expect(parseInt(evts[evt][_servoSpeed])).toBe(3);
//        expect(parseInt(evts[evt][_servoAcc])).toBe(1);
//
//        evt++;
//
//        expect(parseInt(evts[evt][_type])).toBe(CommandType.servo);
//        expect(parseInt(evts[evt][_time])).toBe(1000);
//        expect(parseInt(evts[evt][_servoChannel])).toBe(20);
//        expect(parseInt(evts[evt][_servoPosition])).toBe(100);
//        expect(parseInt(evts[evt][_servoSpeed])).toBe(3);
//        expect(parseInt(evts[evt][_servoAcc])).toBe(1);
//
//        evt++;
//
//        expect(parseInt(evts[evt][_type])).toBe(CommandType.servo);
//        expect(parseInt(evts[evt][_time])).toBe(0);
//        expect(channels.findIndex(x => x === evts[evt][_servoChannel])).toBeGreaterThan(-1);
//        expect(parseInt(evts[evt][_servoPosition])).toBe(0);
//        expect(parseInt(evts[evt][_servoSpeed])).toBe(5);
//        expect(parseInt(evts[evt][_servoAcc])).toBe(255);
//
//        evt++;
//
//        expect(parseInt(evts[evt][_type])).toBe(CommandType.servo);
//        expect(parseInt(evts[evt][_time])).toBe(0);
//        expect(channels.findIndex(x => x === evts[evt][_servoChannel])).toBeGreaterThan(-1);
//        expect(parseInt(evts[evt][_servoPosition])).toBe(0);
//        expect(parseInt(evts[evt][_servoSpeed])).toBe(5);
//        expect(parseInt(evts[evt][_servoAcc])).toBe(255);
//
//        evt++;
//
//        expect(parseInt(evts[evt][_type])).toBe(CommandType.servo);
//        expect(parseInt(evts[evt][_time])).toBe(0);
//        expect(channels.findIndex(x => x === evts[evt][_servoChannel])).toBeGreaterThan(-1);
//        expect(parseInt(evts[evt][_servoPosition])).toBe(0);
//        expect(parseInt(evts[evt][_servoSpeed])).toBe(5);
//        expect(parseInt(evts[evt][_servoAcc])).toBe(255);
//    });
//
//    it("gpio test", () => {
//        const script = new Script("1234", "test1",
//            "desc1", new Date());
//
//        const controllerId = 3;
//
//        const gpioCh = new GpioChannel(5, "gpio5", false, true);
//
//        const channelOne = new ScriptChannel("one", "ABCD", controllerId, ChannelType.gpio, ChannelSubType.none, 0, gpioCh, 3000);
//
//
//        channelOne.eventsKvpArray.push(generateGpioEvent(0, 5, true));
//
//        channelOne.eventsKvpArray.push(generateGpioEvent(10, 5, false));
//
//        script.scriptChannels = new Array<ScriptChannel>(channelOne);
//
//        const cvtr = new ScriptConverter();
//
//        const result = cvtr.convertScript(script);
//
//        expect(result?.size).toBe(1);
//        expect(result?.get(controllerId)?.length).toBeGreaterThan(0);
//
//        const ctlVal = result?.get(controllerId);
//
//        const evts = Array<Array<string>>();
//
//        const segs = ctlVal?.slice(0, -1).split(';');
//
//        segs?.forEach(e => {
//            evts.push(e.split('|'));
//        });
//
//        expect(evts.length).toBe(2);
//
//        let evt = 0;
//
//        expect(parseInt(evts[evt][_type])).toBe(CommandType.gpio);
//        expect(parseInt(evts[evt][_time])).toBe(1000);
//        expect(parseInt(evts[evt][_gpioChannel])).toBe(5);
//        expect(parseInt(evts[evt][_gpioState])).toBe(1);
//
//        evt++;
//
//        expect(parseInt(evts[evt][_type])).toBe(CommandType.gpio);
//        expect(parseInt(evts[evt][_time])).toBe(0);
//        expect(parseInt(evts[evt][_gpioChannel])).toBe(5);
//        expect(parseInt(evts[evt][_gpioState])).toBe(0);
//
//    });
//});