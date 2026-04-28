import type { Scenario } from '../runner.js';
import { formatSd } from '../operations/formatSd.js';
import { registrationSync } from '../operations/registrationSync.js';
import { benchControllers } from '../fixtures/demo-location.js';
import type { ScenarioFactory, SessionContext } from './_shared.js';

export const formatAndSync: ScenarioFactory = (session: SessionContext): Scenario => ({
  id: 'format-and-sync',
  description: 'Wipe SD on all controllers then registration sync.',
  severity: 'destructive',
  setup: [formatSd(benchControllers(session.configSync))],
  act: [registrationSync()],
});
