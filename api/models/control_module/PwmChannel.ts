import { PwmType } from "./ControlModule";



export class PwmChannel {
    id: number;
    name: string;
    type: PwmType;
    limit0: number;
    limit1: number;

    constructor(id: number, name: string, type: PwmType, limit0: number, limit1: number) {
        this.name = name;
        this.id = id;
        this.type = type;
        this.limit0 = limit0;
        this.limit1 = limit1;
    }
}
