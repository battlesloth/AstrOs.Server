
import { CommandType } from "src/models/transmission/transmission_format";
import { Utility } from "src/utility";
import { ChannelType, ControllerType , KangarooController , UartModule, UartType, KangarooAction, KangarooEvent, Script, ScriptChannel, ScriptEvent} from "astros-common";
import { ScriptConverter } from "../src/script_converter";

function generateKangarooEvent(time: number, ch1Action: KangarooAction, ch1Speed: number, ch1Position: number,
    ch2Action: KangarooAction, ch2Speed: number, ch2Position: number) {
    
    const data = new KangarooEvent(ch1Action, ch1Speed, ch1Position, ch2Action, ch2Speed, ch2Position)
    
    return {key: time, value: new ScriptEvent("", ChannelType.uart, time, JSON.stringify(data))};
}


describe("Script Converter Tests", () => {
    it("kangaroo test", () => {

        const script = new Script("1234", "test1",
            "desc1", "1970-01-01 00:00:00.000",
            false, "1970-01-01 00:00:00.000",
            false, "1970-01-01 00:00:00.000",
            false, "1970-01-01 00:00:00.000");

        const uartModule = new UartModule(UartType.kangaroo, "Periscope", new KangarooController());

        const channel = new ScriptChannel("1", ControllerType.core, "core", ChannelType.uart, 0, uartModule, 300);

        // cmd|cmd|cmd|cmd|

        // kangaroo example each ___ is unit_8
        // |___|___ ___ ___ ___ ___ ___ ___ ___|
        //  evt ch  cmd spd     pos     time till
        // PWM => 1, I2C => 2, Generic Serial => 3, Kangaroo => 4 
        // field*field*field*field

        // ROO:4*780*


        // lifter up 780, slow
        channel.eventsKvpArray.push(
            generateKangarooEvent(0,
                KangarooAction.position, 780, 100,
                KangarooAction.none, 0, 0));

        // lifter down 350, slow
        channel.eventsKvpArray.push(
            generateKangarooEvent(12,
                KangarooAction.position, 350, 100,
                KangarooAction.none, 0, 0));

        // lifter up 690, slow
        channel.eventsKvpArray.push(
            generateKangarooEvent(18,
                KangarooAction.position, 690, 100,
                KangarooAction.none, 0, 0));

        // spinner ccw, moderate
        channel.eventsKvpArray.push(
            generateKangarooEvent(22,
                KangarooAction.none, 0, 0,
                KangarooAction.position, -350, 700));

        // spinner cw, fast
        channel.eventsKvpArray.push(
            generateKangarooEvent(27,
                KangarooAction.none, 0, 0,
                KangarooAction.position, 700, 2000));

        //lifter up 790, slow
        channel.eventsKvpArray.push(
            generateKangarooEvent(30,
                KangarooAction.position, 790, 100,
                KangarooAction.none, 0, 0));

        // spinner ccw, mod
        channel.eventsKvpArray.push(
            generateKangarooEvent(32,
                KangarooAction.none, 0, 0,
                KangarooAction.position, 350, 400));

        // spinner home
        channel.eventsKvpArray.push(
            generateKangarooEvent(37,
                KangarooAction.none, 0, 0,
                KangarooAction.home, 0, 0));

        // lifter down -15
        channel.eventsKvpArray.push(
            generateKangarooEvent(38,
                KangarooAction.position, 780, 100,
                KangarooAction.none, 0, 0));

        script.scriptChannels = new Array<ScriptChannel>(channel);

        const cvtr = new ScriptConverter();

        const result = cvtr.convertScript(script);

        expect(result?.get(ControllerType.core)?.length).toBeGreaterThan(0);
        expect(result?.get(ControllerType.dome)?.length).toBe(0);
        expect(result?.get(ControllerType.body)?.length).toBe(0);

        const coreVal = result?.get(ControllerType.core);

        const bytes = Utility.asciiToUint8Array(coreVal!); 

        expect(bytes[0]).toBe(CommandType.kangaroo);
        expect(bytes[1]).toBe(1);

        expect(bytes[11]).toBe(CommandType.kangaroo);
        expect(bytes[12]).toBe(1);

        expect(bytes[22]).toBe(CommandType.kangaroo);
        expect(bytes[23]).toBe(1);

        expect(bytes[33]).toBe(CommandType.kangaroo);
        expect(bytes[34]).toBe(2);

        expect(bytes[44]).toBe(CommandType.kangaroo);
        expect(bytes[45]).toBe(2);

        expect(bytes[55]).toBe(CommandType.kangaroo);
        expect(bytes[56]).toBe(1);

        expect(bytes[66]).toBe(CommandType.kangaroo);
        expect(bytes[67]).toBe(2);

        expect(bytes[77]).toBe(CommandType.kangaroo);
        expect(bytes[78]).toBe(2);

        expect(bytes[88]).toBe(CommandType.kangaroo);
        expect(bytes[89]).toBe(1);

    });
})