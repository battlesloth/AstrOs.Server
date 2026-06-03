export interface ControlModule {
  id: string;
  name: string;
  address: string;
  fingerprint?: string;
  firmwareVersion?: string;
  // PlatformIO board variant reported via POLL_ACK; `c.6c.1` orchestrator uses
  // this for firmware-asset selection at flash time. Empty/undefined = firmware
  // too old or not yet polled.
  variant?: string;
}
