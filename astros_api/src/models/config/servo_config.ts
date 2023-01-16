export class ServoConfig{
    id: number;
    minPos: number;
    maxPos: number;
    set: boolean;
    inverted: boolean;

    constructor(id: number, minPos: number, maxPos: number, set: boolean, inverted: boolean) {
        this.id = id;
        this.minPos = minPos;
        this.maxPos = maxPos;
        this.set = set;
        this.inverted = inverted;
    }
}
    