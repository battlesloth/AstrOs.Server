import { describe, it, expect } from 'vitest';
import {
  controllerStageLabelKey,
  controllerStatePillKind,
  mapServerStageToUiStage,
} from '../firmwareStageMapping';
import type { ControllerFlashState, ServerFwStage } from '@/types/firmware';

function state(stage: ServerFwStage): ControllerFlashState {
  return { controllerId: 'body', stage };
}

describe('mapServerStageToUiStage', () => {
  it('maps UPLOADING_TO_MASTER to download', () => {
    expect(mapServerStageToUiStage('UPLOADING_TO_MASTER')).toBe('download');
  });

  it('maps SENDING to transfer', () => {
    expect(mapServerStageToUiStage('SENDING')).toBe('transfer');
  });

  it('maps VERIFYING to verify', () => {
    expect(mapServerStageToUiStage('VERIFYING')).toBe('verify');
  });

  it('maps REBOOTING to reboot', () => {
    expect(mapServerStageToUiStage('REBOOTING')).toBe('reboot');
  });

  it('returns null for QUEUED, VERSION_CONFIRMED, FAILED (no specific UI stage row)', () => {
    expect(mapServerStageToUiStage('QUEUED')).toBeNull();
    expect(mapServerStageToUiStage('VERSION_CONFIRMED')).toBeNull();
    expect(mapServerStageToUiStage('FAILED')).toBeNull();
  });
});

describe('controllerStatePillKind', () => {
  it('returns queued for QUEUED', () => {
    expect(controllerStatePillKind(state('QUEUED'))).toBe('queued');
  });

  it('returns updating for all in-flight stages', () => {
    expect(controllerStatePillKind(state('UPLOADING_TO_MASTER'))).toBe('updating');
    expect(controllerStatePillKind(state('SENDING'))).toBe('updating');
    expect(controllerStatePillKind(state('VERIFYING'))).toBe('updating');
    expect(controllerStatePillKind(state('REBOOTING'))).toBe('updating');
  });

  it('returns done for VERSION_CONFIRMED', () => {
    expect(controllerStatePillKind(state('VERSION_CONFIRMED'))).toBe('done');
  });

  it('returns failed for FAILED', () => {
    expect(controllerStatePillKind(state('FAILED'))).toBe('failed');
  });
});

describe('controllerStageLabelKey', () => {
  it('returns the i18n path for stages with a UI mapping', () => {
    expect(controllerStageLabelKey(state('UPLOADING_TO_MASTER'))).toBe(
      'firmware_view.stages.download.label',
    );
    expect(controllerStageLabelKey(state('SENDING'))).toBe('firmware_view.stages.transfer.label');
  });

  it('returns null for stages without a UI mapping', () => {
    expect(controllerStageLabelKey(state('QUEUED'))).toBeNull();
    expect(controllerStageLabelKey(state('VERSION_CONFIRMED'))).toBeNull();
    expect(controllerStageLabelKey(state('FAILED'))).toBeNull();
  });
});
