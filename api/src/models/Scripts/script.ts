export class Script{
    id: string;
    scriptName: string;
    description: string;
    lastSaved: string;
    coreUploaded: boolean;
    dtCoreUploaded: string;
    domeUploaded: boolean;
    dtDomeUploaded: string;
    bodyUploaded: boolean;
    dtBodyUploaded: string;

    constructor(id: string,
        scriptName: string,
        description: string,
        lastSaved: string,
        coreUploaded: boolean,
        dtCoreUploaded: string,
        domeUploaded: boolean,
        dtDomeUploaded: string,
        bodyUploaded: boolean,
        dtBodyUploaded: string){
        this.id = id;
        this.scriptName = scriptName;
        this.description = description;
        this.lastSaved = lastSaved;
        this.coreUploaded = coreUploaded;
        this.dtCoreUploaded = dtCoreUploaded;
        this.domeUploaded = domeUploaded;
        this.dtDomeUploaded = dtDomeUploaded;
        this.bodyUploaded = bodyUploaded;
        this.dtBodyUploaded = dtBodyUploaded;
    }
}