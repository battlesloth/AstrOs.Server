
import { Utility } from "src/utility";
import { ChannelType, ControllerType , KangarooController , UartModule, UartType, KangarooAction, KangarooEvent, Script, ScriptChannel, ScriptEvent} from "astros-common";
import { ScriptConverter, CommandType } from "../src/script_converter";

function generateKangarooEvent(time: number, ch1Action: KangarooAction, ch1Speed: number, ch1Position: number,
    ch2Action: KangarooAction, ch2Speed: number, ch2Position: number) {
    
    const data = new KangarooEvent(ch1Action, ch1Speed, ch1Position, ch2Action, ch2Speed, ch2Position)
    
    return {key: time, value: new ScriptEvent("", ChannelType.uart, time, JSON.stringify(data))};
}


describe("Script Converter Tests", () => {
    it("kangaroo test", () => {

        const script = new Script("1234", "test1",
            "desc1", "1970-01-01 00:00:00.000",
            "1970-01-01 00:00:00.000",
            "1970-01-01 00:00:00.000",
            "1970-01-01 00:00:00.000");

        const uartModule = new UartModule(UartType.kangaroo, "Periscope", new KangarooController());

        const channel = new ScriptChannel("1", ControllerType.core, "core", ChannelType.uart, 0, uartModule, 300);

        // cmd|cmd|cmd|cmd|

        // kangaroo example each ___ is unit_8
        // |___|___|___|______|______|______;
        //  evt ch  cmd spd    pos   time till
        // PWM => 1, I2C => 2, Generic Serial => 3, Kangaroo => 4 
        // field*field*field*field

        // ROO:4*780*


        // lifter up 780, slow
        channel.eventsKvpArray.push(
            generateKangarooEvent(0,
                KangarooAction.position, 100, 780,
                KangarooAction.none, 0, 0));

        // lifter down 350, slow
        channel.eventsKvpArray.push(
            generateKangarooEvent(12 * 1000,
                KangarooAction.position, 100, 350,
                KangarooAction.none, 0, 0));

        // lifter up 690, slow
        channel.eventsKvpArray.push(
            generateKangarooEvent(18 * 1000,
                KangarooAction.position, 100, 690,
                KangarooAction.none, 0, 0));

        // spinner ccw, moderate
        channel.eventsKvpArray.push(
            generateKangarooEvent(22 * 1000,
                KangarooAction.none, 0, 0,
                KangarooAction.position, 700, -350));

        // spinner cw, fast
        channel.eventsKvpArray.push(
            generateKangarooEvent(27 * 1000,
                KangarooAction.none, 0, 0,
                KangarooAction.position, 2000, 700));

        //lifter up 790, slow
        channel.eventsKvpArray.push(
            generateKangarooEvent(30 * 1000,
                KangarooAction.position, 1000, 790,
                KangarooAction.none, 0, 0));

        // spinner ccw, mod
        channel.eventsKvpArray.push(
            generateKangarooEvent(32 * 1000,
                KangarooAction.none, 0, 0,
                KangarooAction.position, 400, 350));

        // spinner home
        channel.eventsKvpArray.push(
            generateKangarooEvent(37 * 1000,
                KangarooAction.none, 0, 0,
                KangarooAction.home, 0, 0));

        // lifter down -15
        channel.eventsKvpArray.push(
            generateKangarooEvent(38 * 1000,
                KangarooAction.position, 200, -15,
                KangarooAction.none, 0, 0));

        script.scriptChannels = new Array<ScriptChannel>(channel);

        const cvtr = new ScriptConverter();

        const result = cvtr.convertScript(script);

        expect(result?.get(ControllerType.core)?.length).toBeGreaterThan(0);
        expect(result?.get(ControllerType.dome)?.length).toBe(0);
        expect(result?.get(ControllerType.body)?.length).toBe(0);

        const coreVal = result?.get(ControllerType.core);

        const evts = Array<Array<string>>();

        const segs = coreVal?.split(';');

        segs?.forEach( e => {
            evts.push(e.split('|'));
        });

        expect(coreVal).toBe('4|12000|1|4|100|780;4|6000|1|4|100|350;4|4000|1|4|100|690;4|5000|2|4|700|-350;4|3000|2|4|2000|700;4|2000|1|4|1000|790;4|5000|2|4|400|350;4|1000|2|2|0|0;4|0|1|4|200|-15;');

        expect(parseInt(evts[0][0])).toBe(CommandType.kangaroo);
        expect(parseInt(evts[0][2])).toBe(1);

        expect(parseInt(evts[1][0])).toBe(CommandType.kangaroo);
        expect(parseInt(evts[1][2])).toBe(1);

        expect(parseInt(evts[2][0])).toBe(CommandType.kangaroo);
        expect(parseInt(evts[2][2])).toBe(1);

        expect(parseInt(evts[3][0])).toBe(CommandType.kangaroo);
        expect(parseInt(evts[3][2])).toBe(2);

        expect(parseInt(evts[4][0])).toBe(CommandType.kangaroo);
        expect(parseInt(evts[4][2])).toBe(2);

        expect(parseInt(evts[5][0])).toBe(CommandType.kangaroo);
        expect(parseInt(evts[5][2])).toBe(1);

        expect(parseInt(evts[6][0])).toBe(CommandType.kangaroo);
        expect(parseInt(evts[6][2])).toBe(2);

        expect(parseInt(evts[7][0])).toBe(CommandType.kangaroo);
        expect(parseInt(evts[7][2])).toBe(2);

        expect(parseInt(evts[8][0])).toBe(CommandType.kangaroo);
        expect(parseInt(evts[8][2])).toBe(1);

    });
})