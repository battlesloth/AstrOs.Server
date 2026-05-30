import { describe, it, expect } from 'vitest';
import {
  FIRMWARE_STAGES,
  stageRowState,
  controllerStageColumn,
  type StageColumnModel,
} from '@/utils/firmwareStageBoard';
import type {
  ControllerFlashStateBySlot,
  FirmwareControllerView,
  FirmwareStage,
} from '@/types/firmware';

// ---------- moved stageRowState coverage ----------
function rowStates(
  phase: 'flashing' | 'done' | 'failed',
  current: FirmwareStage | null,
  failed: FirmwareStage | null = null,
) {
  return FIRMWARE_STAGES.map((stage) =>
    stageRowState({ stage, phase, currentStage: current, failedStage: failed }),
  );
}

describe('stageRowState', () => {
  it('marks earlier stages done, current stage current, later idle (flashing)', () => {
    // order: download, transfer, verify, flash, reboot
    expect(rowStates('flashing', 'verify')).toEqual(['done', 'done', 'current', 'idle', 'idle']);
  });

  it('marks all rows done when phase is done', () => {
    expect(rowStates('done', null)).toEqual(['done', 'done', 'done', 'done', 'done']);
  });

  it('marks the failed stage failed, earlier done, later idle', () => {
    expect(rowStates('failed', null, 'transfer')).toEqual([
      'done',
      'failed',
      'idle',
      'idle',
      'idle',
    ]);
  });

  it('renders all idle when flashing with null current stage', () => {
    expect(rowStates('flashing', null)).toEqual(['idle', 'idle', 'idle', 'idle', 'idle']);
  });

  it('renders all idle when failed with null failed stage', () => {
    expect(rowStates('failed', null, null)).toEqual(['idle', 'idle', 'idle', 'idle', 'idle']);
  });
});

// ---------- controllerStageColumn ----------
const master: Pick<FirmwareControllerView, 'id' | 'label' | 'glyph' | 'isMaster'> = {
  id: 'body',
  label: 'Body',
  glyph: 'B',
  isMaster: true,
};
const padawan: Pick<FirmwareControllerView, 'id' | 'label' | 'glyph' | 'isMaster'> = {
  id: 'core',
  label: 'Core',
  glyph: 'C',
  isMaster: false,
};

function byStage(col: StageColumnModel, stage: string) {
  const row = col.rows.find((r) => r.stage === stage);
  if (row === undefined) throw new Error(`no row for ${stage}`);
  return row;
}

describe('controllerStageColumn — not in update', () => {
  it('renders role idle when state is undefined', () => {
    const col = controllerStageColumn(padawan, undefined);
    expect(col.role).toBe('idle');
  });

  it('still marks padawan Download as na when not in update', () => {
    const col = controllerStageColumn(padawan, undefined);
    expect(byStage(col, 'download').state).toBe('na');
    expect(byStage(col, 'download').hintKey).toBe('firmware_view.stages.master_only');
  });

  it('keeps master Download as idle (not na) when not in update', () => {
    const col = controllerStageColumn(master, undefined);
    expect(col.role).toBe('idle');
    expect(byStage(col, 'download').state).toBe('idle');
  });
});

describe('controllerStageColumn — master', () => {
  it('marks Download current with live percent while uploading', () => {
    const state: ControllerFlashStateBySlot = {
      controllerId: 'body',
      stage: 'UPLOADING_TO_MASTER',
      bytesSent: 50,
      totalBytes: 100,
    };
    const col = controllerStageColumn(master, state);
    expect(col.role).toBe('master');
    expect(byStage(col, 'download').state).toBe('current');
    expect(byStage(col, 'download').percent).toBe(50);
    expect(byStage(col, 'transfer').labelKey).toBe('firmware_view.stages.transfer.label');
  });

  it('marks completed Download as done with 100% once sending', () => {
    const state: ControllerFlashStateBySlot = {
      controllerId: 'body',
      stage: 'SENDING',
      bytesSent: 10,
      totalBytes: 100,
    };
    const col = controllerStageColumn(master, state);
    expect(byStage(col, 'download').state).toBe('done');
    expect(byStage(col, 'download').percent).toBe(100);
    expect(byStage(col, 'transfer').state).toBe('current');
    // The master's Transfer is a broadcast to the padawans — no single percent.
    expect(byStage(col, 'transfer').percent).toBeNull();
  });

  it('surfaces Reboot as current (not idle) during FINALIZING', () => {
    const state: ControllerFlashStateBySlot = {
      controllerId: 'body',
      stage: 'FINALIZING',
      pendingDetail: 'waiting_heartbeat',
    };
    const col = controllerStageColumn(master, state);
    expect(byStage(col, 'reboot').state).toBe('current');
    expect(byStage(col, 'download').state).toBe('done');
    expect(byStage(col, 'flash').state).toBe('done');
    expect(byStage(col, 'reboot').percent).toBeNull();
  });
});

describe('controllerStageColumn — padawan', () => {
  it('renders Download na (Master only) and Receive current with live percent', () => {
    const state: ControllerFlashStateBySlot = {
      controllerId: 'core',
      stage: 'SENDING',
      bytesSent: 54,
      totalBytes: 100,
    };
    const col = controllerStageColumn(padawan, state);
    expect(col.role).toBe('padawan');
    expect(byStage(col, 'download').state).toBe('na');
    const receive = byStage(col, 'transfer');
    expect(receive.state).toBe('current');
    expect(receive.percent).toBe(54);
    expect(receive.labelKey).toBe('firmware_view.stages.receive.label');
    expect(receive.hintKey).toBe('firmware_view.stages.receive.hint');
  });

  it('starts Receive at 0 when the byte count is the stale full bar carried from upload', () => {
    // On the upload→send transition the orchestrator re-emits the upload byte
    // count (== totalBytes) before real deploy progress arrives. A Receive
    // that's still 'current' but reads a full bar is that stale value, so it
    // shows 0, not 100.
    const state: ControllerFlashStateBySlot = {
      controllerId: 'core',
      stage: 'SENDING',
      bytesSent: 100,
      totalBytes: 100,
    };
    const col = controllerStageColumn(padawan, state);
    const receive = byStage(col, 'transfer');
    expect(receive.state).toBe('current');
    expect(receive.percent).toBe(0);
  });

  it('marks all real steps done on VERSION_CONFIRMED but keeps Download na', () => {
    const state: ControllerFlashStateBySlot = {
      controllerId: 'core',
      stage: 'VERSION_CONFIRMED',
      finalVersion: 'v1.4.2',
    };
    const col = controllerStageColumn(padawan, state);
    expect(byStage(col, 'download').state).toBe('na');
    expect(byStage(col, 'transfer').state).toBe('done');
    expect(byStage(col, 'reboot').state).toBe('done');
  });
});

describe('controllerStageColumn — failed', () => {
  it('uses the supplied failedStage to mark the failure row', () => {
    const state: ControllerFlashStateBySlot = {
      controllerId: 'body',
      stage: 'FAILED',
      error: 'hash_mismatch',
    };
    const col = controllerStageColumn(master, state, { failedStage: 'verify' });
    expect(byStage(col, 'verify').state).toBe('failed');
    expect(byStage(col, 'download').state).toBe('done');
    expect(byStage(col, 'reboot').state).toBe('idle');
  });
});

describe('controllerStageColumn — queued', () => {
  it('renders all rows idle with master role once queued', () => {
    const state: ControllerFlashStateBySlot = { controllerId: 'body', stage: 'QUEUED' };
    const col = controllerStageColumn(master, state);
    expect(col.role).toBe('master');
    expect(col.rows.map((r) => r.state)).toEqual(['idle', 'idle', 'idle', 'idle', 'idle']);
  });
});

describe('controllerStageColumn — clamp', () => {
  it('clamps a stale byte-count overflow to 100 on the current Download row', () => {
    const state: ControllerFlashStateBySlot = {
      controllerId: 'body',
      stage: 'UPLOADING_TO_MASTER',
      bytesSent: 1_200_000,
      totalBytes: 1_000_000,
    };
    const col = controllerStageColumn(master, state);
    expect(byStage(col, 'download').percent).toBe(100);
  });
});

describe('controllerStageColumn — failed (null stage)', () => {
  it('renders an all-idle column when FAILED with no attributable stage (current approximation)', () => {
    const state: ControllerFlashStateBySlot = {
      controllerId: 'body',
      stage: 'FAILED',
      error: 'aborted',
    };
    const col = controllerStageColumn(master, state, { failedStage: null });
    // Wire FAILED carries no stage; with failedStage null the rows can't
    // attribute the failure, so every row falls back to idle. Pinned so a
    // future column-level failure treatment is a deliberate, test-visible change.
    expect(col.role).toBe('master');
    expect(col.rows.map((r) => r.state)).toEqual(['idle', 'idle', 'idle', 'idle', 'idle']);
  });
});
