import { UploadStatus } from "../astros_enums";
import { ScriptChannel } from "./script_channel";


export class Script {

    id: string;
    scriptName: string;
    description: string;
    lastSaved: Date;

    // Map<ctl id, {date, status}>
    deploymentStatus: Map<number, { date: Date, status: UploadStatus }>;

    scriptChannels: Array<ScriptChannel>;

    constructor(id: string,
        scriptName: string,
        description: string,
        lastSaved: Date) {
        this.id = id;
        this.scriptName = scriptName;
        this.description = description;
        this.lastSaved = lastSaved;
        this.deploymentStatus = new Map<number, { date: Date, status: UploadStatus }>();
        this.scriptChannels = new Array<ScriptChannel>();
    }

    public setDeploymentDates(map: Map<number, Date>): void {
        for (const [key, value] of map) {
            this.updateDeployment(key, value);
        }
    }

    public setDeploymentDate(controllerId: number, date: Date): void {
        this.updateDeployment(controllerId, date);
    }

    public getStatus(controllerId: number): UploadStatus {
        return this.deploymentStatus.get(controllerId)?.status || UploadStatus.notUploaded;
    }

    public updateDeployment(controllerId: number, date: Date): void {
        const status = date > this.lastSaved ? UploadStatus.uploaded : UploadStatus.notUploaded;
        this.deploymentStatus.set(controllerId, { date: date, status: status });
    }
}