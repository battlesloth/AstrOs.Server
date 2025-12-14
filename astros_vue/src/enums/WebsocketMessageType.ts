export enum WebsocketMessageType {
  script = 0,
  configurationSync = 1,
  locationStatus = 2,
  controllersSync = 3,
  run = 4,
  panic = 5,
  directCommand = 6,
  formatSD = 7,
  servoTest = 8,
}