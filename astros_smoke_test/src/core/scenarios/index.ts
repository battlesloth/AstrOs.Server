import type { ScenarioFactory } from './_shared.js';
import { syncOnly } from './sync-only.js';
import { formatAndSync } from './format-and-sync.js';
import { configOnly } from './config-only.js';
import { fullHappyPath } from './full-happy-path.js';
import { directCommandSweep } from './direct-command-sweep.js';
import { servoTestSweep } from './servo-test-sweep.js';
import { panicDrill } from './panic-drill.js';
import { headsCuriousDuet } from './heads-curious-duet.js';

export * from './_shared.js';
export {
  syncOnly,
  formatAndSync,
  configOnly,
  fullHappyPath,
  directCommandSweep,
  servoTestSweep,
  panicDrill,
  headsCuriousDuet,
};

export const scenarios: Record<string, ScenarioFactory> = {
  'sync-only': syncOnly,
  'format-and-sync': formatAndSync,
  'config-only': configOnly,
  'full-happy-path': fullHappyPath,
  'direct-command-sweep': directCommandSweep,
  'servo-test-sweep': servoTestSweep,
  'panic-drill': panicDrill,
  'heads-curious-duet': headsCuriousDuet,
};

export function listScenarioIds(): string[] {
  return Object.keys(scenarios);
}

export function getScenarioFactory(id: string): ScenarioFactory {
  const factory = scenarios[id];
  if (!factory) {
    throw new Error(`Unknown scenario: ${id}. Available: ${listScenarioIds().join(', ')}`);
  }
  return factory;
}
