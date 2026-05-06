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
