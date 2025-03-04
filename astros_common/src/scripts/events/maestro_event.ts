export class MaestroEvent {
  isServo: boolean;
  position: number;
  speed: number;
  acceleration: number;

  constructor(
    isServo: boolean,
    position: number,
    speed: number,
    acceleration: number,
  ) {
    this.isServo = isServo;
    this.position = position;
    this.speed = speed;
    this.acceleration = acceleration;
  }
}
