import type { Scenario } from '../runner.js';
import { registrationSync } from '../operations/registrationSync.js';
import { deployConfig } from '../operations/deployConfig.js';
import { deployScript } from '../operations/deployScript.js';
import { runScript } from '../operations/runScript.js';
import { buildScript } from '../fixtures/scripts/_heads-primitives.js';
import { hideAndSeekBeats } from '../fixtures/scripts/heads-hide-and-seek.js';
import { waitStep, type ScenarioFactory, type SessionContext } from './_shared.js';

export const headsHideAndSeek: ScenarioFactory = (session: SessionContext): Scenario => {
  const built = buildScript(session.configSync, hideAndSeekBeats());
  return {
    id: 'heads-hide-and-seek',
    description:
      'R hides; L searches the room and the sky; R pops up; both laugh-nod and pose triumphantly.',
    severity: 'caution',
    arrange: [registrationSync(), deployConfig(session.configSync), deployScript(built.upload)],
    act: [runScript(built.run), waitStep(built.durationMs + 200, 'let-script-play')],
  };
};
