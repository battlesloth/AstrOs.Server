export class ServoConfig{
    id: number;
    minPos: number;
    maxPos: number;
    set: boolean;

    constructor(id: number, minPos: number, maxPos: number, set: boolean) {
        this.id = id;
        this.minPos = minPos;
        this.maxPos = maxPos;
        this.set = set;
    }
}
    