import type { ConfigSync } from '@api/models/config/config_sync.js';
import type { ControlModule } from '@api/models/control_module/control_module.js';
import type { Scenario, Step } from '../runner.js';
import type { Transport } from '../transport.js';

export interface SessionContext {
  transport: Transport;
  configSync: ConfigSync;
  master: ControlModule;
  padawan: ControlModule;
}

export type ScenarioFactory = (session: SessionContext) => Scenario;

export function waitStep(ms: number, name = `wait-${ms}ms`): Step {
  return {
    name,
    run: async () => {
      await new Promise((r) => setTimeout(r, ms));
      return { ok: true, durationMs: ms };
    },
  };
}
