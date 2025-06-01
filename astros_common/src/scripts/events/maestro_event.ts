export class MaestroEvent {
  channel: number;
  isServo: boolean;
  position: number;
  speed: number;
  acceleration: number;

  constructor(
    channel: number,
    isServo: boolean,
    position: number,
    speed: number,
    acceleration: number,
  ) {
    this.channel = channel;
    this.isServo = isServo;
    this.position = position;
    this.speed = speed;
    this.acceleration = acceleration;
  }
}
