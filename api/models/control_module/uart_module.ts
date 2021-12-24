export enum UartType{
    none,
    kangaroo
}

export class UartModule {
    name: string;
    type: UartType;
    module: any;

    constructor() {
        this.name = "unnamed";
        this.type = UartType.none;
    }
}
