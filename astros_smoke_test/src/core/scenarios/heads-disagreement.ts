import type { Scenario } from '../runner.js';
import { registrationSync } from '../operations/registrationSync.js';
import { deployConfig } from '../operations/deployConfig.js';
import { deployScript } from '../operations/deployScript.js';
import { runScript } from '../operations/runScript.js';
import { buildScript } from '../fixtures/scripts/_heads-primitives.js';
import { disagreementBeats } from '../fixtures/scripts/heads-disagreement.js';
import { waitStep, type ScenarioFactory, type SessionContext } from './_shared.js';

export const headsDisagreement: ScenarioFactory = (session: SessionContext): Scenario => {
  const built = buildScript(session.configSync, disagreementBeats());
  return {
    id: 'heads-disagreement',
    description:
      'R shakes no, L nods yes, both argue with the LED, R wins and L reluctantly agrees.',
    severity: 'caution',
    arrange: [registrationSync(), deployConfig(session.configSync), deployScript(built.upload)],
    act: [runScript(built.run), waitStep(built.durationMs + 200, 'let-script-play')],
  };
};
