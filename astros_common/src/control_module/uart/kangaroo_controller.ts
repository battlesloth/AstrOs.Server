

export class KangarooController {
    channelOneName = "channel 1";
    channelTwoName = "channel 2";

    constructor(init?: Partial<KangarooController>) {
        Object.assign(this, init);
    }
}
