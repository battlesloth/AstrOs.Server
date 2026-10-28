// Payload of a random span on an ESP GPIO channel: the ESP toggles the pin
// at random gaps between minGapMs and maxGapMs until the span ends.
export interface RandomGpioEvent {
  minGapMs: number;
  maxGapMs: number;
}
