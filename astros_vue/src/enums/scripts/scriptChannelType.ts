export enum ScriptChannelType {
  NONE,
  SERVO,
  GPIO,
  AUDIO,
  GENERIC_I2C,
  GENERIC_UART,
  KANGAROO,
}

export const ScriptChannelTypes = [
  ScriptChannelType.SERVO,
  ScriptChannelType.GPIO,
  ScriptChannelType.AUDIO,
  ScriptChannelType.GENERIC_I2C,
  ScriptChannelType.GENERIC_UART,
  ScriptChannelType.KANGAROO,
]