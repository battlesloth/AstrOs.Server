export class MaestroEvent {
  channelId: number;
  position: number;
  speed: number;
  acceleration: number;

  constructor(
    channelId: number,
    position: number,
    speed: number,
    acceleration: number,
  ) {
    this.channelId = channelId;
    this.position = position;
    this.speed = speed;
    this.acceleration = acceleration;
  }
}
