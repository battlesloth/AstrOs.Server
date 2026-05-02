import { describe, it, expect } from 'vitest';
import { FwStage } from '../models/firmware/firmware_messages.js';
import type {
  ControllerFlashState,
  FlashJobState,
  FlashSource,
} from '../models/firmware/flash_job_state.js';
import {
  deriveJobLifecycle,
  isControllerStageTerminal,
  transitionControllerState,
} from './flash_job_state_machine.js';

const C_ID = 'core';

function queued(
  overrides: Partial<{ bytesSent: number; totalBytes: number; detail: string }> = {},
): ControllerFlashState {
  return {
    stage: FwStage.Queued,
    controllerId: C_ID,
    bytesSent: 0,
    totalBytes: 0,
    detail: '',
    ...overrides,
  };
}

function withStage(
  stage: FwStage.UploadingToMaster | FwStage.Sending | FwStage.Verifying | FwStage.Rebooting,
  overrides: Partial<{ bytesSent: number; totalBytes: number; detail: string }> = {},
): ControllerFlashState {
  return {
    stage,
    controllerId: C_ID,
    bytesSent: 0,
    totalBytes: 0,
    detail: '',
    ...overrides,
  };
}

function versionConfirmed(finalVersion = '1.4.0'): ControllerFlashState {
  return {
    stage: FwStage.VersionConfirmed,
    controllerId: C_ID,
    bytesSent: 1024,
    totalBytes: 1024,
    detail: '',
    finalVersion,
  };
}

function failed(error = 'simulated'): ControllerFlashState {
  return {
    stage: FwStage.Failed,
    controllerId: C_ID,
    bytesSent: 0,
    totalBytes: 0,
    detail: '',
    error,
  };
}

const SOURCE: FlashSource = {
  kind: 'github',
  version: '1.4.0',
  sha256: 'abc',
  sizeBytes: 1024,
  displayName: 'astros-esp 1.4.0',
};

function jobStateWith(controllers: ControllerFlashState[], abortReason?: string): FlashJobState {
  return {
    jobId: 'job-1',
    source: SOURCE,
    controllers,
    startedAt: '2026-05-02T15:00:00.000Z',
    abortReason,
  };
}

describe('isControllerStageTerminal', () => {
  it.each([
    [FwStage.VersionConfirmed, true],
    [FwStage.Failed, true],
    [FwStage.Queued, false],
    [FwStage.UploadingToMaster, false],
    [FwStage.Sending, false],
    [FwStage.Verifying, false],
    [FwStage.Rebooting, false],
  ])('%s → %s', (stage, expected) => {
    expect(isControllerStageTerminal(stage)).toBe(expected);
  });
});

describe('transitionControllerState — happy path', () => {
  it('progresses through the full linear sequence', () => {
    let state = queued();
    state = transitionControllerState(state, FwStage.UploadingToMaster);
    expect(state.stage).toBe(FwStage.UploadingToMaster);
    state = transitionControllerState(state, FwStage.Sending);
    expect(state.stage).toBe(FwStage.Sending);
    state = transitionControllerState(state, FwStage.Verifying);
    expect(state.stage).toBe(FwStage.Verifying);
    state = transitionControllerState(state, FwStage.Rebooting);
    expect(state.stage).toBe(FwStage.Rebooting);
    state = transitionControllerState(state, FwStage.VersionConfirmed, {
      finalVersion: '1.4.0',
    });
    expect(state.stage).toBe(FwStage.VersionConfirmed);
    if (state.stage === FwStage.VersionConfirmed) {
      expect(state.finalVersion).toBe('1.4.0');
    }
  });

  it('does not mutate the input state', () => {
    const before = queued({ bytesSent: 100, totalBytes: 1024, detail: 'starting' });
    const snapshot = JSON.parse(JSON.stringify(before));
    transitionControllerState(before, FwStage.UploadingToMaster, { bytesSent: 200 });
    expect(before).toEqual(snapshot);
  });

  it.each([
    FwStage.Queued,
    FwStage.UploadingToMaster,
    FwStage.Sending,
    FwStage.Verifying,
    FwStage.Rebooting,
  ] as const)('Failed is reachable from %s', (fromStage) => {
    const start: ControllerFlashState =
      fromStage === FwStage.Queued ? queued() : withStage(fromStage);
    const result = transitionControllerState(start, FwStage.Failed, { error: 'test' });
    expect(result.stage).toBe(FwStage.Failed);
    if (result.stage === FwStage.Failed) {
      expect(result.error).toBe('test');
    }
  });
});

describe('transitionControllerState — illegal transitions throw', () => {
  it('skipping a stage (Queued → Sending) throws', () => {
    expect(() => transitionControllerState(queued(), FwStage.Sending)).toThrow(/illegal/i);
  });

  it('reverse direction (Sending → Queued) throws', () => {
    expect(() => transitionControllerState(withStage(FwStage.Sending), FwStage.Queued)).toThrow(
      /illegal/i,
    );
  });

  it.each([
    FwStage.Queued,
    FwStage.UploadingToMaster,
    FwStage.Sending,
    FwStage.Verifying,
    FwStage.Rebooting,
    FwStage.VersionConfirmed,
    FwStage.Failed,
  ] as const)('VersionConfirmed → %s throws', (toStage) => {
    expect(() => {
      // `as` cast because some toStage values are valid types for the
      // overload but illegal at runtime; we're testing the runtime guard.
      const fn = transitionControllerState as (
        c: ControllerFlashState,
        s: FwStage,
        p?: { finalVersion?: string; error?: string },
      ) => unknown;
      fn(versionConfirmed(), toStage, { finalVersion: 'x', error: 'x' });
    }).toThrow(/illegal/i);
  });

  it.each([
    FwStage.Queued,
    FwStage.UploadingToMaster,
    FwStage.Sending,
    FwStage.Verifying,
    FwStage.Rebooting,
    FwStage.VersionConfirmed,
    FwStage.Failed,
  ] as const)('Failed → %s throws', (toStage) => {
    expect(() => {
      const fn = transitionControllerState as (
        c: ControllerFlashState,
        s: FwStage,
        p?: { finalVersion?: string; error?: string },
      ) => unknown;
      fn(failed(), toStage, { finalVersion: 'x', error: 'x' });
    }).toThrow(/illegal/i);
  });
});

describe('transitionControllerState — payload validation', () => {
  it('VersionConfirmed without finalVersion throws', () => {
    const start = withStage(FwStage.Rebooting);
    expect(() => {
      const fn = transitionControllerState as (
        c: ControllerFlashState,
        s: FwStage,
        p?: { finalVersion?: string },
      ) => unknown;
      fn(start, FwStage.VersionConfirmed);
    }).toThrow(/finalVersion/);
  });

  it('Failed without error throws', () => {
    const start = withStage(FwStage.Sending);
    expect(() => {
      const fn = transitionControllerState as (
        c: ControllerFlashState,
        s: FwStage,
        p?: { error?: string },
      ) => unknown;
      fn(start, FwStage.Failed);
    }).toThrow(/error/);
  });

  it('non-terminal transition with no payload preserves prior bytesSent/totalBytes/detail', () => {
    const start = queued({ bytesSent: 256, totalBytes: 1024, detail: 'pending upload' });
    const next = transitionControllerState(start, FwStage.UploadingToMaster);
    expect(next.bytesSent).toBe(256);
    expect(next.totalBytes).toBe(1024);
    expect(next.detail).toBe('pending upload');
  });
});

describe('transitionControllerState — same-stage progress updates', () => {
  // FW_PROGRESS messages arrive multiple times within a single stage
  // (e.g., bytesSent flowing during Sending). The orchestrator
  // translates each into `transitionControllerState(state, currentStage,
  // payload)` — same-stage transitions must merge the payload onto the
  // current state without throwing.

  it.each([
    FwStage.Queued,
    FwStage.UploadingToMaster,
    FwStage.Sending,
    FwStage.Verifying,
    FwStage.Rebooting,
  ] as const)('non-terminal %s → %s merges bytesSent', (stage) => {
    const start: ControllerFlashState =
      stage === FwStage.Queued
        ? queued({ bytesSent: 100, totalBytes: 1024, detail: 'mid-flight' })
        : withStage(stage, { bytesSent: 100, totalBytes: 1024, detail: 'mid-flight' });
    const next = transitionControllerState(start, stage, { bytesSent: 500 });
    expect(next.stage).toBe(stage);
    expect(next.bytesSent).toBe(500);
    expect(next.totalBytes).toBe(1024);
    expect(next.detail).toBe('mid-flight');
  });

  it('same-stage update with no payload is a no-op equivalent', () => {
    const start = withStage(FwStage.Sending, {
      bytesSent: 256,
      totalBytes: 1024,
      detail: 'streaming',
    });
    const next = transitionControllerState(start, FwStage.Sending);
    expect(next).toEqual(start);
    expect(next).not.toBe(start); // still returns a new object
  });

  it('terminal-to-self stays illegal: VersionConfirmed → VersionConfirmed throws', () => {
    expect(() =>
      transitionControllerState(versionConfirmed(), FwStage.VersionConfirmed, {
        finalVersion: '1.4.0',
      }),
    ).toThrow(/illegal/i);
  });

  it('terminal-to-self stays illegal: Failed → Failed throws', () => {
    expect(() =>
      transitionControllerState(failed(), FwStage.Failed, { error: 'still failed' }),
    ).toThrow(/illegal/i);
  });
});

describe('transitionControllerState — payload merging on legal in-flight transitions', () => {
  it('merges new bytesSent while preserving totalBytes and detail', () => {
    const start = withStage(FwStage.UploadingToMaster, {
      bytesSent: 100,
      totalBytes: 1024,
      detail: 'mid-upload',
    });
    const next = transitionControllerState(start, FwStage.Sending, { bytesSent: 1024 });
    expect(next.bytesSent).toBe(1024);
    expect(next.totalBytes).toBe(1024);
    expect(next.detail).toBe('mid-upload');
  });

  it('merges new detail while preserving byte counts', () => {
    const start = withStage(FwStage.Sending, {
      bytesSent: 1024,
      totalBytes: 1024,
      detail: 'sent',
    });
    const next = transitionControllerState(start, FwStage.Verifying, { detail: 'verifying hash' });
    expect(next.bytesSent).toBe(1024);
    expect(next.totalBytes).toBe(1024);
    expect(next.detail).toBe('verifying hash');
  });
});

describe('deriveJobLifecycle', () => {
  it("returns 'failed' when abortReason is set, regardless of controller states", () => {
    expect(
      deriveJobLifecycle(
        jobStateWith([versionConfirmed(), versionConfirmed()], 'master_disconnect'),
      ),
    ).toBe('failed');
  });

  it("returns 'pending' when every controller is Queued", () => {
    expect(deriveJobLifecycle(jobStateWith([queued(), queued()]))).toBe('pending');
  });

  it("returns 'in_flight' when controllers are mixed (Queued + Sending)", () => {
    expect(deriveJobLifecycle(jobStateWith([queued(), withStage(FwStage.Sending)]))).toBe(
      'in_flight',
    );
  });

  it("returns 'done' when every controller is VersionConfirmed", () => {
    expect(deriveJobLifecycle(jobStateWith([versionConfirmed(), versionConfirmed()]))).toBe('done');
  });

  it("returns 'done' when every controller is Failed (job ran to completion, all failed individually)", () => {
    expect(deriveJobLifecycle(jobStateWith([failed(), failed()]))).toBe('done');
  });

  it("returns 'done' for mixed terminal states (one VersionConfirmed, one Failed)", () => {
    expect(deriveJobLifecycle(jobStateWith([versionConfirmed(), failed()]))).toBe('done');
  });

  it("returns 'done' for empty controllers array (degenerate input)", () => {
    expect(deriveJobLifecycle(jobStateWith([]))).toBe('done');
  });

  it("returns 'in_flight' when one controller is terminal and another is mid-stream", () => {
    expect(deriveJobLifecycle(jobStateWith([versionConfirmed(), withStage(FwStage.Sending)]))).toBe(
      'in_flight',
    );
  });
});
