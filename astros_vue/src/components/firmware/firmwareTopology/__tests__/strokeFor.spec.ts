import { describe, it, expect } from 'vitest';
import { strokeFor, TOPOLOGY_STROKE_COLORS } from '../strokeFor';
import type { TopologyPhase } from '../types';

const base = {
  controllerId: 'core',
  isSelected: true,
  isMaster: false,
  failedControllerId: undefined,
} as const;

describe('strokeFor', () => {
  it('returns unselected when not selected, regardless of phase or isMaster', () => {
    // Mutation guard: if the `!isSelected` early-return were reordered below the
    // `phase === 'flashing' && isMaster` branch, an unselected master would render
    // as `masterFlashing`. The `isMaster: true` row here pins that ordering.
    for (const phase of ['idle', 'select', 'flashing', 'done', 'failed'] as TopologyPhase[]) {
      for (const isMaster of [false, true]) {
        expect(strokeFor({ ...base, isSelected: false, isMaster, phase })).toBe(
          TOPOLOGY_STROKE_COLORS.unselected,
        );
      }
    }
  });

  it('returns selectedDefault in `idle` phase for any selected controller', () => {
    expect(strokeFor({ ...base, phase: 'idle' })).toBe(TOPOLOGY_STROKE_COLORS.selectedDefault);
    expect(strokeFor({ ...base, isMaster: true, phase: 'idle' })).toBe(
      TOPOLOGY_STROKE_COLORS.selectedDefault,
    );
  });

  it('returns success for any selected node in `done`', () => {
    expect(strokeFor({ ...base, phase: 'done' })).toBe(TOPOLOGY_STROKE_COLORS.success);
    expect(strokeFor({ ...base, isMaster: true, phase: 'done' })).toBe(
      TOPOLOGY_STROKE_COLORS.success,
    );
  });

  it('returns failure for the failed controller in `failed`', () => {
    expect(strokeFor({ ...base, phase: 'failed', failedControllerId: 'core' })).toBe(
      TOPOLOGY_STROKE_COLORS.failure,
    );
  });

  it('returns success for non-failing controllers in `failed`', () => {
    expect(strokeFor({ ...base, phase: 'failed', failedControllerId: 'dome' })).toBe(
      TOPOLOGY_STROKE_COLORS.success,
    );
  });

  it('returns success for any selected controller in `failed` when failedControllerId is undefined', () => {
    expect(strokeFor({ ...base, phase: 'failed' })).toBe(TOPOLOGY_STROKE_COLORS.success);
  });

  it('returns masterFlashing only for the master while flashing', () => {
    expect(strokeFor({ ...base, isMaster: true, phase: 'flashing' })).toBe(
      TOPOLOGY_STROKE_COLORS.masterFlashing,
    );
  });

  it('returns padawanFlashing for non-master selected controllers while flashing', () => {
    expect(strokeFor({ ...base, phase: 'flashing' })).toBe(TOPOLOGY_STROKE_COLORS.padawanFlashing);
  });

  it('returns selectedDefault in `select` phase for any selected controller', () => {
    expect(strokeFor({ ...base, phase: 'select' })).toBe(TOPOLOGY_STROKE_COLORS.selectedDefault);
    expect(strokeFor({ ...base, isMaster: true, phase: 'select' })).toBe(
      TOPOLOGY_STROKE_COLORS.selectedDefault,
    );
  });

  it('failedControllerId is ignored in non-failed phases', () => {
    // Mutation guard: if the phase-check were dropped from the failed branch,
    // this test would start returning `failure` for a flashing controller.
    expect(strokeFor({ ...base, phase: 'flashing', failedControllerId: 'core' })).toBe(
      TOPOLOGY_STROKE_COLORS.padawanFlashing,
    );
  });
});
