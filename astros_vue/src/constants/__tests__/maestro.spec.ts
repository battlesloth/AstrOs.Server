// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { RELEASE_MS_DEFAULT, RELEASE_MS_MAX, RELEASE_MS_MIN } from '@/constants/maestro';

// The API module can't be imported here (its `src/...` specifiers don't
// resolve in this project), so its constants are read from the source text.
// A Vue default outside the API's range would make every save of a new
// Maestro module a 400; a different range would let the form accept values
// the server refuses, or refuse ones it accepts.
const apiSource = readFileSync(
  fileURLToPath(
    new URL(
      '../../../../astros_api/src/models/control_module/uart/sub_modules/maestro/release_ms.ts',
      import.meta.url,
    ),
  ),
  'utf8',
);

function apiConstant(name: string): number {
  const match = apiSource.match(new RegExp(`^export const ${name} = (\\d+);$`, 'm'));
  if (!match) throw new Error(`${name} not found in the API's release_ms.ts`);
  return Number(match[1]);
}

describe('constants/maestro', () => {
  it.each([
    ['RELEASE_MS_DEFAULT', RELEASE_MS_DEFAULT],
    ['RELEASE_MS_MIN', RELEASE_MS_MIN],
    ['RELEASE_MS_MAX', RELEASE_MS_MAX],
  ])('%s matches the API', (name, value) => {
    expect(value).toBe(apiConstant(name));
  });
});
