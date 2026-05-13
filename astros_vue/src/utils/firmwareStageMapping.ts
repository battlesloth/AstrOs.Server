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
      // Treat unknown stages as "no UI stage" so the row simply stays at
      // its previous pill state rather than mis-rendering.
      // The `_exhaustive: never` assignment is a compile-time guard: if a
      // new ServerFwStage value is added to the union without a matching
      // case above, this line fails type-check. Runtime is unaffected.
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
    case 'REBOOTING':
      return 'updating';
    case 'VERSION_CONFIRMED':
      return 'done';
    case 'FAILED':
      return 'failed';
    default: {
      // Forward-compat: an unknown ServerFwStage would otherwise return
      // undefined from this switch, and the row would render with an
      // undefined pill kind. Map to 'updating' as the safest fallback —
      // the row keeps spinning until a recognized stage arrives. The
      // `_exhaustive: never` assignment is a compile-time guard mirroring
      // mapServerStageToUiStage above.
      const _exhaustive: never = state.stage;
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
