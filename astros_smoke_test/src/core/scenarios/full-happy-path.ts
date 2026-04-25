import { v4 as uuidv4 } from 'uuid';
import type { Scenario } from '../runner.js';
import { formatSd } from '../operations/formatSd.js';
import { registrationSync } from '../operations/registrationSync.js';
import { deployConfig } from '../operations/deployConfig.js';
import { deployScript } from '../operations/deployScript.js';
import { runScript } from '../operations/runScript.js';
import { panicStop } from '../operations/panicStop.js';
import { benchControllers } from '../fixtures/demo-location.js';
import { buildScriptRun } from '../fixtures/helpers.js';
import { waveHello } from '../fixtures/scripts/wave-hello.js';
import { waitStep, type ScenarioFactory, type SessionContext } from './_shared.js';

export const fullHappyPath: ScenarioFactory = (session: SessionContext): Scenario => {
  const scriptId = uuidv4();
  const upload = waveHello(session.configSync, scriptId);
  const run = buildScriptRun(session.configSync, scriptId);

  return {
    id: 'full-happy-path',
    description:
      'Format SD → registration sync → deploy config → deploy script → run (wave-hello) → panic.',
    severity: 'destructive',
    setup: [formatSd(benchControllers(session.configSync))],
    arrange: [registrationSync(), deployConfig(session.configSync), deployScript(upload)],
    act: [runScript(run), waitStep(2000, 'let-servo-move')],
    teardown: [panicStop(run)],
  };
};
