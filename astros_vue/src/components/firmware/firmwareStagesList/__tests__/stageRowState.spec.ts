import { describe, it, expect } from 'vitest';
import { FIRMWARE_STAGES, stageRowState } from '../stageRowState';
import type { FirmwarePhase, FirmwareStage } from '@/types/firmware';

function rowsForPhase(opts: {
  phase: FirmwarePhase;
  currentStage?: FirmwareStage | null;
  failedStage?: FirmwareStage | null;
}) {
  return FIRMWARE_STAGES.map((stage) =>
    stageRowState({
      stage,
      phase: opts.phase,
      currentStage: opts.currentStage ?? null,
      failedStage: opts.failedStage ?? null,
    }),
  );
}

describe('stageRowState', () => {
  it("marks every stage 'idle' when phase is 'idle' or 'select'", () => {
    expect(rowsForPhase({ phase: 'idle' })).toEqual(['idle', 'idle', 'idle', 'idle', 'idle']);
    expect(rowsForPhase({ phase: 'select' })).toEqual(['idle', 'idle', 'idle', 'idle', 'idle']);
  });

  it("marks every stage 'done' when phase is 'done'", () => {
    expect(rowsForPhase({ phase: 'done' })).toEqual(['done', 'done', 'done', 'done', 'done']);
  });

  it("marks earlier stages 'done', the matching stage 'current', later stages 'idle' when flashing", () => {
    expect(rowsForPhase({ phase: 'flashing', currentStage: 'flash' })).toEqual([
      'done',
      'done',
      'current',
      'idle',
      'idle',
    ]);
  });

  it("returns all 'idle' when flashing with no currentStage", () => {
    expect(rowsForPhase({ phase: 'flashing', currentStage: null })).toEqual([
      'idle',
      'idle',
      'idle',
      'idle',
      'idle',
    ]);
  });

  it("marks the failing stage 'failed' with earlier stages 'done' and later stages 'idle'", () => {
    expect(rowsForPhase({ phase: 'failed', failedStage: 'transfer' })).toEqual([
      'done',
      'failed',
      'idle',
      'idle',
      'idle',
    ]);
  });

  it("returns all 'idle' when failed with no failedStage", () => {
    expect(rowsForPhase({ phase: 'failed', failedStage: null })).toEqual([
      'idle',
      'idle',
      'idle',
      'idle',
      'idle',
    ]);
  });

  it('handles the first-stage failure case (no earlier rows to mark done)', () => {
    expect(rowsForPhase({ phase: 'failed', failedStage: 'download' })).toEqual([
      'failed',
      'idle',
      'idle',
      'idle',
      'idle',
    ]);
  });

  it('handles the last-stage current case (no later rows to mark idle)', () => {
    expect(rowsForPhase({ phase: 'flashing', currentStage: 'reboot' })).toEqual([
      'done',
      'done',
      'done',
      'done',
      'current',
    ]);
  });
});
