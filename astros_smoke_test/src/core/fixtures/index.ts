import type { ConfigSync } from '@api/models/config/config_sync.js';
import type { ScriptUpload } from '@api/models/scripts/script_upload.js';
import { waveHello } from './scripts/wave-hello.js';
import { multiChannel } from './scripts/multi-channel.js';
import { longRunner } from './scripts/long-runner.js';

export * from './demo-location.js';
export * from './helpers.js';
export { waveHello, multiChannel, longRunner };

export interface ScriptFixture {
  id: string;
  description: string;
  build: (sync: ConfigSync, scriptId?: string) => ScriptUpload;
}

export const scriptFixtures: Record<string, ScriptFixture> = {
  'wave-hello': {
    id: 'wave-hello',
    description: 'Master servo ch 1 sweeps max → min → home',
    build: waveHello,
  },
  'multi-channel': {
    id: 'multi-channel',
    description: 'Master servo + padawan relay LED, concurrent',
    build: multiChannel,
  },
  'long-runner': {
    id: 'long-runner',
    description: '~6s servo sweep with padawan LED — used by panic-drill',
    build: longRunner,
  },
};

export function getScriptFixture(id: string): ScriptFixture {
  const fixture = scriptFixtures[id];
  if (!fixture) {
    throw new Error(
      `Unknown script fixture: ${id}. Available: ${Object.keys(scriptFixtures).join(', ')}`,
    );
  }
  return fixture;
}
