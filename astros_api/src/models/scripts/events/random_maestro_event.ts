// Payload of a random span on a Maestro channel. Positions and moves are
// percent of the channel's range; maxMove null means no max. isServo is a
// copy: the server overwrites it from the stored channel on save and converts
// by the channel's current servo/digital setting. A digital channel uses only
// channel and the gaps.
export interface RandomMaestroEvent {
  channel: number;
  isServo: boolean;
  minGapMs: number;
  maxGapMs: number;
  minPos: number;
  maxPos: number;
  minMove: number;
  maxMove: number | null;
  speed: number;
  acceleration: number;
}
