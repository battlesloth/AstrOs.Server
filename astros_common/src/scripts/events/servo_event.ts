export class ServoEvent {

    channelId: number
    position: number;
    speed: number;

    constructor(channelId: number, position: number, speed: number) {
        this.channelId = channelId;
        this.position = position;
        this.speed = speed;
    }
}