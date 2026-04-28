import type { Scenario } from '../runner.js';
import { registrationSync } from '../operations/registrationSync.js';
import { deployConfig } from '../operations/deployConfig.js';
import { deployScript } from '../operations/deployScript.js';
import { runScript } from '../operations/runScript.js';
import { buildScript } from '../fixtures/scripts/_heads-primitives.js';
import { curiousDuetBeats } from '../fixtures/scripts/heads-curious-duet.js';
import { waitStep, type ScenarioFactory, type SessionContext } from './_shared.js';

export const headsCuriousDuet: ScenarioFactory = (session: SessionContext): Scenario => {
  const built = buildScript(session.configSync, curiousDuetBeats());
  return {
    id: 'heads-curious-duet',
    description: 'Two heads look around together, make eye contact, nod, and look up triumphantly.',
    severity: 'caution',
    arrange: [registrationSync(), deployConfig(session.configSync), deployScript(built.upload)],
    act: [runScript(built.run), waitStep(built.durationMs + 200, 'let-script-play')],
  };
};
