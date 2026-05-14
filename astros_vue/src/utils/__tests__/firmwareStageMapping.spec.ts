import { describe, it, expect, vi } from 'vitest';
import {
  controllerStageLabelKey,
  controllerStatePillKind,
  mapServerStageToUiStage,
} from '../firmwareStageMapping';
import type { ControllerFlashState, ServerFwStage } from '@/types/firmware';

function state(stage: ServerFwStage): ControllerFlashState {
  // After IM-2 (discriminated union), VERSION_CONFIRMED requires
  // finalVersion and FAILED requires error. Provide test placeholders
  // so the function can be invoked with any stage.
  if (stage === 'VERSION_CONFIRMED') {
    return { controllerId: 'body', stage, finalVersion: 'v1.0.0-test' };
  }
  if (stage === 'FAILED') {
    return { controllerId: 'body', stage, error: 'test:error' };
  }
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

  it('returns null (not undefined) for unknown future server stages (C3 forward-compat)', () => {
    // Round-5 C3 fix: without the default case, an unknown ServerFwStage
    // value falls through the switch and returns undefined. Downstream
    // `if (ui !== null)` guards would then write `undefined` to a
    // FirmwareStage|null ref. The cast simulates a future enum value.
    const unknown = 'WAITING_ON_NETWORK' as unknown as ServerFwStage;
    expect(mapServerStageToUiStage(unknown)).toBeNull();
  });

  it('emits a console.warn for unknown stages so contract drift is debuggable (round-6 C3 breadcrumb)', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const unknown = 'CANCELLED' as unknown as ServerFwStage;
      mapServerStageToUiStage(unknown);
      const warnText = warnSpy.mock.calls.flat().join(' ');
      expect(warnText).toContain('unknown stage="CANCELLED"');
    } finally {
      warnSpy.mockRestore();
    }
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

  it('emits a console.warn for unknown stages (round-6 C3 breadcrumb)', () => {
    // A future ServerFwStage like 'CANCELLED' would render an 'updating'
    // pill forever (no terminal stage update will arrive). The warn
    // surfaces the contract drift in dev console + production logs.
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const unknown = 'CANCELLED' as unknown as ServerFwStage;
      controllerStatePillKind(state(unknown));
      const warnText = warnSpy.mock.calls.flat().join(' ');
      expect(warnText).toContain('unknown stage="CANCELLED"');
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('returns updating (not undefined) for unknown future server stages (C3 forward-compat)', () => {
    // Without the default case, an unknown stage returned undefined, which
    // the StatusPill component would receive as kind=undefined. Mapping
    // unknowns to 'updating' keeps the row spinning safely until a
    // recognized stage arrives.
    const unknown = 'WAITING_ON_NETWORK' as unknown as ServerFwStage;
    expect(controllerStatePillKind(state(unknown))).toBe('updating');
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

describe('FlashErrorReason i18n key contract (IM-8)', () => {
  // Every FlashErrorReason in the union must have a corresponding
  // firmware_view.flash_errors.<reason> key in enUS.json. Without this
  // pin, adding a new reason to the tuple without updating the locale
  // file would render the literal key path in the operator's UI.
  it('every FlashErrorReason has a corresponding firmware_view.flash_errors.* i18n key', async () => {
    const { FLASH_ERROR_REASONS } = await import('@/types/firmware');
    const enUS = (await import('@/locales/enUS.json')).default as unknown as {
      firmware_view: { flash_errors: Record<string, string> };
    };
    for (const reason of FLASH_ERROR_REASONS) {
      expect(enUS.firmware_view.flash_errors).toHaveProperty(reason);
    }
  });
});
