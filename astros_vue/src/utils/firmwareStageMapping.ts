import type {
  ControllerFlashState,
  FirmwareStage,
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
  }
}

/**
 * Project the i18n key path for the stage label shown under a row's status
 * pill during `updating` mode. Returns null for stages without a UI stage
 * (caller renders no label).
 */
export function controllerStageLabelKey(state: ControllerFlashState): string | null {
  const uiStage = mapServerStageToUiStage(state.stage);
  return uiStage === null ? null : `firmware_view.stages.${uiStage}.label`;
}
