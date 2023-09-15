export enum KangarooAction{
    none,
    start,
    home,
    speed,
    position,
    positionIncremental
}

export class KangarooEvent {
      
        uartChannel: number;
        ch1Action: KangarooAction;
        ch1Speed: number;
        ch1Position: number;
        ch2Action: KangarooAction;
        ch2Speed: number;
        ch2Position: number;
      
    constructor(uartChannel: number, ch1Action: KangarooAction, ch1Speed: number, ch1Position: number,
        ch2Action: KangarooAction, ch2Speed: number, ch2Position: number){
        this.uartChannel = uartChannel;
        this.ch1Action = ch1Action;
        this.ch1Speed = ch1Speed;
        this.ch1Position = ch1Position;
        this.ch2Action = ch2Action;
        this.ch2Speed = ch2Speed;
        this.ch2Position = ch2Position;
    }
}