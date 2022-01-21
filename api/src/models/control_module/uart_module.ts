export enum UartType{
    none,
    genericSerial,
    kangaroo
}

export class UartModule {
    moduleName: string;
    type: UartType;
    module: any;

    constructor(type: UartType, moduleName: string, module: any) {
        this.type = type;
        this.moduleName = moduleName;
        this.module = module;
    }
}
