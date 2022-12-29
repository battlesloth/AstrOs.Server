import { ServoChannel } from "./servo_channel";



export class ServoModule {
    channels: ServoChannel[];

    constructor() {
        this.channels = new Array<ServoChannel>();
    }
}
