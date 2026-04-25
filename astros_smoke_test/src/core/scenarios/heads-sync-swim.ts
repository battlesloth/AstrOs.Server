import type { Scenario } from '../runner.js';
import { registrationSync } from '../operations/registrationSync.js';
import { deployConfig } from '../operations/deployConfig.js';
import { deployScript } from '../operations/deployScript.js';
import { runScript } from '../operations/runScript.js';
import { buildScript } from '../fixtures/scripts/_heads-primitives.js';
import { syncSwimBeats } from '../fixtures/scripts/heads-sync-swim.js';
import { waitStep, type ScenarioFactory, type SessionContext } from './_shared.js';

export const headsSyncSwim: ScenarioFactory = (session: SessionContext): Scenario => {
  const built = buildScript(session.configSync, syncSwimBeats());
  return {
    id: 'heads-sync-swim',
    description: 'Pure choreography — sync pans, opposing sweeps, eye-contact converge, look up.',
    severity: 'caution',
    arrange: [registrationSync(), deployConfig(session.configSync), deployScript(built.upload)],
    act: [runScript(built.run), waitStep(built.durationMs + 200, 'let-script-play')],
  };
};
