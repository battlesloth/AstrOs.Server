// Payload of a random span on a Maestro channel. Positions and moves are
// percent of the channel's range; maxMove null means no max. When isServo is
// false only channel and the gaps are used.
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
