export class GenericSerialEvent {

    value: string;
    uartChannel: number;
    baudRate: number;

    constructor(uartChannel: number, baudRate: number, value: string) {
        this.uartChannel = uartChannel;
        this.baudRate = baudRate;
        this.value = value;
    }
}