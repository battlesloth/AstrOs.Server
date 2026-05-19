import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiServer } from './api_server.js';

describe('ApiServer.bootstrap misconfiguration', () => {
  // ApiServer is imported as a class by the integration harness; any
  // process.exit inside its init path would compromise graceful failure
  // handling for callers. This suite pins the contract: missing required
  // config rejects bootstrap() rather than calling process.exit.
  //
  // Note: vitest replaces process.exit with a function that throws
  // ('process.exit unexpectedly called with ...') rather than actually
  // exiting the worker — so we cannot distinguish "code rejected" from
  // "code called process.exit and vitest's stub threw" by looking at
  // the rejection alone. We must spy on process.exit and assert it was
  // never called. Without the spy, this test would pass against the very
  // bug it is meant to catch.
  let prevJwt: string | undefined;
  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    prevJwt = process.env.JWT_KEY;
    delete process.env.JWT_KEY;
    exitSpy = vi.spyOn(process, 'exit').mockImplementation((code) => {
      throw new Error(`process.exit(${String(code)}) called from library code`);
    });
  });

  afterEach(() => {
    if (prevJwt !== undefined) process.env.JWT_KEY = prevJwt;
    exitSpy.mockRestore();
  });

  it('rejects with a JWT_KEY error rather than calling process.exit', async () => {
    // Bypass `ApiServer.bootstrap()` and drive `Init()` directly. bootstrap
    // wraps any Init failure as `new Error('Failed to initialize server')`
    // with no `cause`, dropping the original message — so asserting on the
    // generic wrapper would also match unrelated Init failures (e.g. a
    // future regression in initializeDatabase). Calling Init() directly
    // surfaces the JWT_KEY-specific message.
    //
    // skipSerialSetup is set explicitly so the test does not depend on
    // vitest's NODE_ENV='test' routing for the serial branch. The DB
    // branch still relies on NODE_ENV='test' to pick the in-memory
    // adapter (no DATABASE_PATH needed); configApi runs after DB init
    // but before the serial check, so the JWT_KEY throw fires first
    // either way — but the explicit override removes one implicit
    // dependency.
    const server = new ApiServer({ configOverrides: { skipSerialSetup: true } });
    await expect(server.Init()).rejects.toThrow(/JWT_KEY is required/);

    // Load-bearing: process.exit must not have been called from library
    // code. If it were, the spy would have recorded the call. Without
    // this assertion, the test would pass even if Init reverted to
    // calling process.exit — vitest's stub turns process.exit into a
    // throw, which also satisfies the rejects.toThrow check above.
    expect(exitSpy).not.toHaveBeenCalled();
  });
});

describe('ApiServer route-scoped fileUpload wiring', () => {
  // Source-grep architectural pin for the run-2 cross-feature regression
  // where a single global `app.use(fileUpload({...limitHandler: firmwareUploadLimitHandler}))`
  // caused `/api/audio/savefile` overflow to return a firmware-typed JSON 413
  // ("Firmware upload exceeds…") to the audio UI. The fix path-scoped both
  // mounts so the firmware limitHandler only fires on the firmware route.
  //
  // A behavior-level test would require booting Express with a full DB / JWT
  // / serial harness just to assert a 413 wire shape; the structural pin
  // catches the exact regression form (untargeted fileUpload mount, or
  // limitHandler bleeding onto a non-firmware path) at near-zero cost.
  // Read once at suite load — api_server.ts is the test's subject and
  // doesn't change between cases.
  const apiServerSource = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), 'api_server.ts'),
    'utf8',
  );

  it('does not register a global fileUpload middleware (would re-introduce the audio 413 regression)', () => {
    // The regression form: `this.app.use(fileUpload({...}))` with no
    // path-prefix first argument. The fixed form always has a path string
    // before the `fileUpload(...)` call.
    const globalMount = /\bthis\.app\.use\s*\(\s*fileUpload\s*\(/;
    expect(globalMount.test(apiServerSource)).toBe(false);
  });

  it('only the /api/firmware/upload mount wires firmwareUploadLimitHandler', () => {
    // For each `this.app.use('<path>', fileUpload(...))` block, slice from
    // the path literal to the matching mount terminator (`}));`) and grep
    // that slice for `firmwareUploadLimitHandler`. Bounding the slice at
    // the terminator rather than a fixed character window prevents the
    // audio-mount's slice from accidentally including the firmware
    // mount's body (or any unrelated text that follows).
    //
    // Audio (or any future multipart route) must not inherit the
    // firmware-typed JSON 413 body — that's the run-2 regression shape.
    const pathPattern = /this\.app\.use\s*\(\s*['"](\/api\/[^'"]+)['"]\s*,\s*fileUpload\s*\(/g;
    const matches = Array.from(apiServerSource.matchAll(pathPattern));
    const mounts = matches.map((m) => {
      const start = m.index ?? 0;
      const remainder = apiServerSource.slice(start);
      const terminator = remainder.indexOf('}));');
      // No terminator means malformed source — surface as a missing slice
      // rather than silently passing the assertion.
      const body = terminator === -1 ? '' : remainder.slice(0, terminator + '}));'.length);
      return { path: m[1], body };
    });
    // Sanity: both expected mounts exist and both slices are non-empty.
    expect(mounts.map((m) => m.path).sort()).toEqual([
      '/api/audio/savefile',
      '/api/firmware/upload',
    ]);
    expect(mounts.every((m) => m.body.length > 0)).toBe(true);
    // The firmware mount carries the limitHandler; the audio mount does not.
    const firmware = mounts.find((m) => m.path === '/api/firmware/upload');
    const audio = mounts.find((m) => m.path === '/api/audio/savefile');
    expect(firmware?.body).toMatch(/firmwareUploadLimitHandler/);
    expect(audio?.body).not.toMatch(/firmwareUploadLimitHandler/);
  });
});
