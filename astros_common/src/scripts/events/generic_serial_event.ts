export class GenericSerialEvent {

    value: string;
    uartChannel: number;

    constructor(uartChannel: number, value: string) {
        this.uartChannel = uartChannel;
        this.value = value;
    }
}