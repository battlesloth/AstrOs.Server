import { v4 as uuidv4 } from 'uuid';
import type { Scenario } from '../runner.js';
import { registrationSync } from '../operations/registrationSync.js';
import { deployConfig } from '../operations/deployConfig.js';
import { deployScript } from '../operations/deployScript.js';
import { runScript } from '../operations/runScript.js';
import { panicStop } from '../operations/panicStop.js';
import { buildScriptRun } from '../fixtures/helpers.js';
import { longRunner } from '../fixtures/scripts/long-runner.js';
import { waitStep, type ScenarioFactory, type SessionContext } from './_shared.js';

export const panicDrill: ScenarioFactory = (session: SessionContext): Scenario => {
  const scriptId = uuidv4();
  const upload = longRunner(session.configSync, scriptId);
  const run = buildScriptRun(session.configSync, scriptId);

  return {
    id: 'panic-drill',
    description:
      'Deploy long-runner, start it, panic-stop mid-run — servo should halt immediately.',
    severity: 'caution',
    arrange: [registrationSync(), deployConfig(session.configSync), deployScript(upload)],
    act: [runScript(run), waitStep(1500, 'let-it-run'), panicStop(run)],
  };
};
