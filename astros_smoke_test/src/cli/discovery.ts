import { MessageHandler } from '@api/serial/message_handler.js';
import type { ControlModule } from '@api/models/control_module/control_module.js';
import { registrationSync } from '../core/operations/registrationSync.js';
import { BENCH } from '../core/fixtures/demo-location.js';
import type { Transport } from '../core/transport.js';

export interface DiscoveryResult {
  ok: boolean;
  registrations: ControlModule[];
  padawan?: ControlModule;
  durationMs: number;
  detail?: string;
}

export async function discover(transport: Transport): Promise<DiscoveryResult> {
  const step = registrationSync();
  const result = await step.run({ transport });

  if (!result.ok || !result.rawResponse) {
    return {
      ok: false,
      registrations: [],
      durationMs: result.durationMs,
      detail: result.detail ?? 'No registration sync response',
    };
  }

  const handler = new MessageHandler();
  const validation = handler.validateMessage(result.rawResponse);
  if (!validation.valid) {
    return {
      ok: false,
      registrations: [],
      durationMs: result.durationMs,
      detail: 'Registration sync ACK failed validation',
    };
  }

  const response = handler.handleRegistraionSyncAck(validation.data);
  const padawan = response.registrations.find(
    (m) => m.address.length > 0 && m.address !== BENCH.masterAddress,
  );

  return {
    ok: true,
    registrations: response.registrations,
    padawan,
    durationMs: result.durationMs,
  };
}
