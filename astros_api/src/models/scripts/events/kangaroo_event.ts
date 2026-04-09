export enum KangarooAction {
  none,
  start,
  home,
  speed,
  position,
  positionIncremental,
}

export interface KangarooEvent {
  ch1Action: KangarooAction;
  ch1Speed: number;
  ch1Position: number;
  ch2Action: KangarooAction;
  ch2Speed: number;
  ch2Position: number;
}
