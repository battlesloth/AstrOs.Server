import type {
  ControllerFlashState,
  FirmwareStage,
  FirmwareStageLabelKey,
  FirmwareStatusPillKind,
  ServerFwStage,
} from '@/types/firmware';

/**
 * Project a server-side stage onto a UI stage row. Returns null for stages
 * that have no corresponding row (QUEUED — handled via the per-controller
 * pill; VERSION_CONFIRMED — terminal success; FAILED — terminal failure
 * surfaced via the row's `!` glyph).
 */
export function mapServerStageToUiStage(stage: ServerFwStage): FirmwareStage | null {
  switch (stage) {
    case 'UPLOADING_TO_MASTER':
      return 'download';
    case 'SENDING':
      return 'transfer';
    case 'VERIFYING':
      return 'verify';
    case 'FLASHING':
      return 'flash';
    case 'REBOOTING':
      return 'reboot';
    case 'QUEUED':
    case 'VERSION_CONFIRMED':
    case 'FAILED':
      return null;
    default: {
      // Forward-compat: a future server-side `ServerFwStage` value would
      // otherwise fall through this switch and return undefined, breaking
      // downstream `if (ui !== null)` checks (undefined !== null is true).
      // Treat unknown stages as "no UI stage" so the global stage indicator
      // stays at its previous value rather than flipping to undefined.
      // The `_exhaustive: never` assignment is a compile-time guard: if a
      // new ServerFwStage value is added to the union without a matching
      // case above, this line fails type-check.
      console.warn(
        `[firmwareStageMapping] mapServerStageToUiStage: unknown stage="${stage}". ` +
          `Server contract drift — global stage indicator will not advance until a recognized stage arrives.`,
      );
      const _exhaustive: never = stage;
      void _exhaustive;
      return null;
    }
  }
}

/** Project a per-controller server state onto a `StatusPill` kind. */
export function controllerStatePillKind(state: ControllerFlashState): FirmwareStatusPillKind {
  switch (state.stage) {
    case 'QUEUED':
      return 'queued';
    case 'UPLOADING_TO_MASTER':
    case 'SENDING':
    case 'VERIFYING':
    case 'FLASHING':
    case 'REBOOTING':
      return 'updating';
    case 'VERSION_CONFIRMED':
      return 'done';
    case 'FAILED':
      return 'failed';
    default: {
      // Forward-compat for future server stages. The `never` exhaustiveness
      // covers every ServerFwStage variant, so this branch only fires when
      // a runtime payload lies about its `stage` (e.g. a future 'CANCELLED'
      // cast through the type at the WS boundary). Fall back to 'updating'
      // so the row stays in an unambiguous in-progress indicator until a
      // recognized stage arrives; the warn surfaces the contract drift.
      const stateAsAny = state as { stage: string; controllerId: string };
      console.warn(
        `[firmwareStageMapping] controllerStatePillKind: unknown stage="${stateAsAny.stage}" ` +
          `for controllerId="${stateAsAny.controllerId}". Server contract drift — row will stay on 'updating' until a recognized stage arrives.`,
      );
      const _exhaustive: never = state;
      void _exhaustive;
      return 'updating';
    }
  }
}

/**
 * Project the i18n key path for the stage label shown under a row's status
 * pill during `updating` mode. Returns null for stages without a UI stage
 * (caller renders no label).
 */
export function controllerStageLabelKey(state: ControllerFlashState): FirmwareStageLabelKey | null {
  const uiStage = mapServerStageToUiStage(state.stage);
  return uiStage === null ? null : `firmware_view.stages.${uiStage}.label`;
}
