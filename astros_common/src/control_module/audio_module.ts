export enum AudioModuleType{
    Disabled,
    DfPlayer,
    HumanCyborgRelations,
    Server
}

export class AudioModule {
    type: AudioModuleType;
    settings: Map<string, string>;
    // becuase javascript can't handle serializing maps. ffs. 
    entries: Array<[string, string]>;
    
    constructor() {
        this.type = AudioModuleType.Disabled;
        this.settings = new Map<string, string>();
        this.entries = new Array<[string, string]>();
    }

    public setType(val: string){
        switch (val){
            case "DfPlayer":
                this.type = AudioModuleType.DfPlayer;
                break
            case "HumanCyborgRelations":
                this.type = AudioModuleType.HumanCyborgRelations;
                break
            case "Server":
                this.type = AudioModuleType.Server;
                break
            default:
                this.type = AudioModuleType.Disabled;
                break; 
        }
    }

    public static getType(val: AudioModule){
        switch (val.type){
            case AudioModuleType.DfPlayer:
                return "DfPlayer";
            case AudioModuleType.HumanCyborgRelations:
                return "HumanCyborgRelations";
            case AudioModuleType.Server:
                 return "Server";
            default:
                return "Error";
        }
    }
}