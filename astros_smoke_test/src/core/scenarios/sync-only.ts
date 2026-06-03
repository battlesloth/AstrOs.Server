import type { Scenario } from '../runner.js';
import { registrationSync } from '../operations/registrationSync.js';
import type { ScenarioFactory } from './_shared.js';

export const syncOnly: ScenarioFactory = (): Scenario => ({
  id: 'sync-only',
  description: 'Registration sync only — verifies master is responsive.',
  act: [registrationSync()],
});
