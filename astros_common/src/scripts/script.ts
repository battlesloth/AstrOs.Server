import { ScriptChannel } from "./script_channel";
import { UploadStatus } from "./upload_status";

export class Script{
    id: string;
    scriptName: string;
    description: string;
    lastSaved: string;
    
    coreUploaded: string;
    coreUploadStatus: UploadStatus;

    domeUploaded: string;
    domeUploadStatus: UploadStatus;
    
    bodyUploaded: string;
    bodyUploadStatus: UploadStatus;
    
    scriptChannels: Array<ScriptChannel>;

    constructor(id: string,
        scriptName: string,
        description: string,
        lastSaved: string,
        coreUploaded: string,
        domeUploaded: string,
        bodyUploaded: string){
        this.id = id;
        this.scriptName = scriptName;
        this.description = description;
        this.lastSaved = lastSaved;
        this.coreUploaded = coreUploaded;
        this.domeUploaded = domeUploaded;
        this.bodyUploaded = bodyUploaded;
        this.scriptChannels = new Array<ScriptChannel>();

        this.setStatus();
    }

    private setStatus(){
        this.isNewer(this.bodyUploaded, this.lastSaved) ?
            this.bodyUploadStatus = UploadStatus.uploaded :
            this.bodyUploadStatus = UploadStatus.notUploaded;    
        

        this.isNewer(this.domeUploaded, this.lastSaved) ?
            this.domeUploadStatus = UploadStatus.uploaded :
            this.domeUploadStatus = UploadStatus.notUploaded;    

        this.isNewer(this.coreUploaded, this.lastSaved) ?
            this.coreUploadStatus = UploadStatus.uploaded :
            this.coreUploadStatus = UploadStatus.notUploaded;    
    }

    private isNewer(uploaded: string, saved: string): boolean {
        const upD = new Date(uploaded);
        const savedD = new Date(saved);

        return (upD > savedD); 
    }
}