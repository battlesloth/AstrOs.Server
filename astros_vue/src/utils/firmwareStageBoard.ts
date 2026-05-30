import type {
  ControllerFlashStateBySlot,
  FirmwareControllerView,
  FirmwarePhase,
  FirmwareStage,
  SlotId,
} from '@/types/firmware';
import { mapServerStageToUiStage } from '@/utils/firmwareStageMapping';

// ---- Shared stage order + single-track row state machine ----
export const FIRMWARE_STAGES = ['download', 'transfer', 'verify', 'flash', 'reboot'] as const;

export type StageRowState = 'idle' | 'done' | 'current' | 'failed';

export interface StageRowStateInput {
  stage: FirmwareStage;
  phase: FirmwarePhase;
  currentStage: FirmwareStage | null;
  failedStage: FirmwareStage | null;
}

export function stageRowState(input: StageRowStateInput): StageRowState {
  const { stage, phase, currentStage, failedStage } = input;
  const index = FIRMWARE_STAGES.indexOf(stage);
  if (phase === 'done') return 'done';
  if (phase === 'failed') {
    if (failedStage === null) return 'idle';
    const failedIndex = FIRMWARE_STAGES.indexOf(failedStage);
    if (failedIndex === -1) return 'idle';
    if (index < failedIndex) return 'done';
    if (index === failedIndex) return 'failed';
    return 'idle';
  }
  if (phase === 'flashing') {
    if (currentStage === null) return 'idle';
    const currentIndex = FIRMWARE_STAGES.indexOf(currentStage);
    if (currentIndex === -1) return 'idle';
    if (index < currentIndex) return 'done';
    if (index === currentIndex) return 'current';
    return 'idle';
  }
  return 'idle';
}

// ---- Per-controller board derivation ----

// 'na' = stage doesn't apply to this controller (padawan Download).
export type StageBoardRowState = StageRowState | 'na';

// 'idle' role = controller is not part of the current job ("NOT IN UPDATE").
export type StageColumnRole = 'master' | 'padawan' | 'idle';

export interface StageBoardRow {
  stage: FirmwareStage;
  state: StageBoardRowState;
  /** 1-based badge number; the column component shows it for non-terminal rows
   *  (idle / current / na) and swaps in a glyph for done/failed. */
  index: number;
  /** i18n key path for the row label; resolved by the column component. */
  labelKey: string;
  /** i18n key path for the row hint. */
  hintKey: string;
  /** Integer 0..100 for byte-bearing rows (download[master]/transfer); null otherwise. */
  percent: number | null;
}

export interface StageColumnModel {
  id: SlotId;
  label: string;
  glyph: string;
  isMaster: boolean;
  role: StageColumnRole;
  participating: boolean;
  rows: StageBoardRow[];
}

export interface ControllerStageColumnOptions {
  /** The UI stage the job was on when this controller failed, sourced from
   *  the store's `failedControllers` summary. Used only when the controller's
   *  state is FAILED — drives which row renders the failure glyph. The wire
   *  FAILED state carries no stage, so this is the global-stage approximation
   *  (same one the old single-track list used). */
  failedStage?: FirmwareStage | null;
}

// Stages whose progress is byte-driven: the master Download (file lands on the
// master) and the Transfer/Receive (master → padawans). Verify/Flash/Reboot
// are not byte-progress stages, so they never show a percent.
const BYTE_BEARING_STAGES: ReadonlySet<FirmwareStage> = new Set<FirmwareStage>([
  'download',
  'transfer',
]);

function clampPercent(
  bytesSent: number | undefined,
  totalBytes: number | undefined,
): number | null {
  if (typeof totalBytes !== 'number' || totalBytes <= 0) return null;
  if (typeof bytesSent !== 'number') return null;
  // Clamp so a stale bytesSent overflow can't render as "117%".
  return Math.round(Math.max(0, Math.min(1, bytesSent / totalBytes)) * 100);
}

// Project one controller's server-side state onto the (phase, currentStage,
// failedStage) triple the row state machine consumes.
function deriveProgress(
  state: ControllerFlashStateBySlot | undefined,
  failedStage: FirmwareStage | null,
): { phase: FirmwarePhase; currentStage: FirmwareStage | null; failedStage: FirmwareStage | null } {
  if (state === undefined) return { phase: 'idle', currentStage: null, failedStage: null };
  switch (state.stage) {
    case 'QUEUED':
      // Accepted but nothing started — every row pending.
      return { phase: 'flashing', currentStage: null, failedStage: null };
    case 'UPLOADING_TO_MASTER':
    case 'SENDING':
    case 'VERIFYING':
    case 'FLASHING':
    case 'REBOOTING':
      return {
        phase: 'flashing',
        currentStage: mapServerStageToUiStage(state.stage),
        failedStage: null,
      };
    case 'FINALIZING':
      // Post-reboot heartbeat wait — surface Reboot as the active row.
      return { phase: 'flashing', currentStage: 'reboot', failedStage: null };
    case 'VERSION_CONFIRMED':
      return { phase: 'done', currentStage: null, failedStage: null };
    case 'FAILED':
      return { phase: 'failed', currentStage: null, failedStage };
  }
}

/**
 * Build the 5-row column model for a single controller.
 *
 * Role rules applied on top of the row state machine:
 *  - Padawan Download row → 'na' ("Master only"); padawans never download.
 *  - Step-2 label = "Transfer" (master) / "Receive" (padawan); same stage id.
 *  - Percent attaches only to byte-bearing rows: live % while current, 100% when done.
 */
export function controllerStageColumn(
  controller: Pick<FirmwareControllerView, 'id' | 'label' | 'glyph' | 'isMaster'>,
  state: ControllerFlashStateBySlot | undefined,
  options: ControllerStageColumnOptions = {},
): StageColumnModel {
  const { isMaster } = controller;
  const progress = deriveProgress(state, options.failedStage ?? null);
  // `'bytesSent' in state` narrows to the in-flight union arm that carries bytes.
  const bytes = state !== undefined && 'bytesSent' in state ? state : null;

  const rows: StageBoardRow[] = FIRMWARE_STAGES.map((stage, i) => {
    let rowState: StageBoardRowState = stageRowState({
      stage,
      phase: progress.phase,
      currentStage: progress.currentStage,
      failedStage: progress.failedStage,
    });
    if (stage === 'download' && !isMaster) rowState = 'na';

    const labelKey =
      stage === 'transfer'
        ? isMaster
          ? 'firmware_view.stages.transfer.label'
          : 'firmware_view.stages.receive.label'
        : `firmware_view.stages.${stage}.label`;

    const hintKey =
      stage === 'download' && !isMaster
        ? 'firmware_view.stages.master_only'
        : stage === 'transfer'
          ? isMaster
            ? 'firmware_view.stages.transfer.hint'
            : 'firmware_view.stages.receive.hint'
          : `firmware_view.stages.${stage}.hint`;

    let percent: number | null = null;
    if (BYTE_BEARING_STAGES.has(stage)) {
      if (rowState === 'current') {
        percent = bytes !== null ? clampPercent(bytes.bytesSent, bytes.totalBytes) : null;
      } else if (rowState === 'done') {
        percent = 100;
      }
    }

    return { stage, state: rowState, index: i + 1, labelKey, hintKey, percent };
  });

  return {
    id: controller.id,
    label: controller.label,
    glyph: controller.glyph,
    isMaster,
    role: state === undefined ? 'idle' : isMaster ? 'master' : 'padawan',
    participating: state !== undefined,
    rows,
  };
}
