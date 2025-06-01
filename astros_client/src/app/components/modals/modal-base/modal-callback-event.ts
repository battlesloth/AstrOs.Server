export class ModalCallbackEvent {
  public type: string;
  public value: unknown;

  constructor(type: string, value: unknown) {
    this.type = type;
    this.value = value;
  }
}
