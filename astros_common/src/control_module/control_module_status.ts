import { ControllerType } from "../astros_enums";

export class ControlModuleStatus{
    id: ControllerType;

    ipAddress: string;
    
    online: boolean;
    synced: boolean;

    constructor(id: ControllerType){
        this.id = id;
        this.ipAddress = '';
        this.online = false;
        this.synced = false;
    }
}

