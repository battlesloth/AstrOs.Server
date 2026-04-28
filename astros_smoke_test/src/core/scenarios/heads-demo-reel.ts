import type { Scenario } from '../runner.js';
import { registrationSync } from '../operations/registrationSync.js';
import { deployConfig } from '../operations/deployConfig.js';
import { deployScript } from '../operations/deployScript.js';
import { runScript } from '../operations/runScript.js';
import { buildScript } from '../fixtures/scripts/_heads-primitives.js';
import { curiousDuetBeats } from '../fixtures/scripts/heads-curious-duet.js';
import { disagreementBeats } from '../fixtures/scripts/heads-disagreement.js';
import { hideAndSeekBeats } from '../fixtures/scripts/heads-hide-and-seek.js';
import { syncSwimBeats } from '../fixtures/scripts/heads-sync-swim.js';
import { waitStep, type ScenarioFactory, type SessionContext } from './_shared.js';

export const headsDemoReel: ScenarioFactory = (session: SessionContext): Scenario => {
  // Each buildScript call uses uuidv4 by default, so the four scripts get
  // distinct ids — no collision when all four are deployed simultaneously.
  const a = buildScript(session.configSync, curiousDuetBeats());
  const b = buildScript(session.configSync, disagreementBeats());
  const c = buildScript(session.configSync, hideAndSeekBeats());
  const d = buildScript(session.configSync, syncSwimBeats());

  return {
    id: 'heads-demo-reel',
    description:
      'Plays curious-duet → disagreement → hide-and-seek → sync-swim back-to-back, mimicking a Sequential Playlist.',
    severity: 'caution',
    arrange: [
      registrationSync(),
      deployConfig(session.configSync),
      deployScript(a.upload),
      deployScript(b.upload),
      deployScript(c.upload),
      deployScript(d.upload),
    ],
    act: [
      runScript(a.run),
      waitStep(a.durationMs + 200, 'curious-duet'),
      runScript(b.run),
      waitStep(b.durationMs + 200, 'disagreement'),
      runScript(c.run),
      waitStep(c.durationMs + 200, 'hide-and-seek'),
      runScript(d.run),
      waitStep(d.durationMs + 200, 'sync-swim'),
    ],
  };
};
