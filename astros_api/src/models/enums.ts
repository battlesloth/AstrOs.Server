export enum ScriptChannelType {
  NONE,
  SERVO,
  GPIO,
  AUDIO,
  GENERIC_I2C,
  GENERIC_UART,
  KANGAROO,
}

export enum ModuleType {
  none = 0,
  uart = 1,
  i2c = 2,
  gpio = 3,
}

export enum ModuleSubType {
  none = 0,
  // serial subtypes
  genericSerial = 101,
  kangaroo = 102,
  humanCyborgRelationsSerial = 103,
  maestro = 104,

  // i2c subtypes
  genericI2C = 201,
  humanCyborgRelationsI2C = 202,
  pwmBoard = 203,

  // gpio
  genericGpio = 301,
}

export class ModuleChannelTypes {
  static readonly Unknown = '';
  static readonly BaseChannel = 'BaseChannel';
  static readonly GpioChannel = 'GpioChannel';
  static readonly I2cChannel = 'I2cChannel';
  static readonly PwmChannel = 'PwmChannel';
  static readonly UartChannel = 'UartChannel';
  static readonly KangarooX2Channel = 'KangarooX2Channel';
  static readonly MaestroChannel = 'MaestroChannel';

  static fromSubType(subtype: ModuleSubType) {
    switch (subtype) {
      // serial
      case ModuleSubType.genericSerial:
      case ModuleSubType.humanCyborgRelationsSerial:
        return ModuleChannelTypes.UartChannel;
      case ModuleSubType.kangaroo:
        return ModuleChannelTypes.KangarooX2Channel;
      case ModuleSubType.maestro:
        return ModuleChannelTypes.MaestroChannel;
      // i2c
      case ModuleSubType.humanCyborgRelationsI2C:
      case ModuleSubType.genericI2C:
        return ModuleChannelTypes.I2cChannel;
      case ModuleSubType.pwmBoard:
        return ModuleChannelTypes.PwmChannel;
      // gpio
      case ModuleSubType.genericGpio:
        return ModuleChannelTypes.GpioChannel;
      default:
        return ModuleChannelTypes.Unknown;
    }
  }
}

export enum UploadStatus {
  notUploaded,
  uploading,
  uploaded,
}

export enum ControllerStatus {
  up,
  needsSynced,
  down,
}

// Wire-format numeric IDs. Hand-mirrored by the Vue client's
// `WebsocketMessageType` enum — adding or reordering values here without
// updating the client mirror silently breaks every WS message. Explicit
// `= N` annotations make mid-block insertions visible in diffs rather
// than silently renumbering downstream values; the runtime contract is
// pinned by the wire-numeric test in useWebsocket.spec.ts.
export enum TransmissionType {
  script = 0,
  sync = 1,
  status = 2,
  controllers = 3,
  run = 4,
  panic = 5,
  directCommand = 6,
  formatSD = 7,
  servoTest = 8,
  systemStatus = 9,
  lockStateChanged = 10,
  flashJobActive = 11,
  flashJobStarted = 12,
  flashControllerUpdate = 13,
  flashControllerResult = 14,
  flashJobDone = 15,
  flashJobFailed = 16,
}

export enum TransmissionStatus {
  unknown,
  sending,
  success,
  failed,
}

export enum DirectCommnandType {
  servo,
  i2c,
  uart,
}

export enum HumanCyborgRelationsCmd {
  mildHappy = 1,
  extremeHappy = 2,
  mildSad = 3,
  extremeSad = 4,
  mildAngry = 5,
  extremeAngry = 6,
  mildScared = 7,
  extremeScared = 8,
  overload = 9,
  enableMuse = 10,
  disableMuse = 11,
  toggleMuse = 12,
  triggerMusing = 13,
  minSecondsBetweenMusings = 14,
  maxSecondsBetweenMusings = 15,
  playWavOnA = 16,
  playWavOnB = 17,
  playSdRandomOnA = 18,
  playSdRandomOnB = 19,
  panicStop = 20,
  gracefulStop = 21,
  stopWavOnA = 22,
  stopWavOnB = 23,
  vocalizerVolume = 24,
  wavAVolume = 25,
  wavBVolume = 26,
  enableImprov = 27,
  enableCanonical = 28,
  enablePersonalityOverride = 29,
  disablePersonalityOverride = 30,
  zeroEmotions = 31,
  setHappyLevel = 32,
  setSadLevel = 33,
  setMadLevel = 34,
  setScaredLevel = 35,
}

export enum HcrCommandCategory {
  none,
  stimuli,
  muse,
  sdWav,
  stop,
  volume,
  override,
}
