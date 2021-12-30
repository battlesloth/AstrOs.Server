export class ScriptEvent {

    id: string;
    scriptChannel: string;
    time: number;
    dataJson: string;

    constructor(id: string, scriptChannel: string, time: number, dataJson: string) {
        this.id = id;
        this.scriptChannel = scriptChannel;
        this.time = time;
        this.dataJson = dataJson;
    }
}
