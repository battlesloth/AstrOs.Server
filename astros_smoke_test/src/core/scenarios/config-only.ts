import type { Scenario } from '../runner.js';
import { deployConfig } from '../operations/deployConfig.js';
import type { ScenarioFactory, SessionContext } from './_shared.js';

export const configOnly: ScenarioFactory = (session: SessionContext): Scenario => ({
  id: 'config-only',
  description: 'Deploy the bench config and confirm ACK from all controllers.',
  act: [deployConfig(session.configSync)],
});
