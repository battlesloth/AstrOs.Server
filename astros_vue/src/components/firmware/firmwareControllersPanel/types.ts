import type {
  FirmwarePhase,
  FirmwareStage,
  FirmwareStageLabelKey,
  FirmwareStatusPillKind,
  SlotId,
} from '@/types/firmware';

export type ControllersPanelPhase = Exclude<FirmwarePhase, 'idle'>;

export interface ControllerProgressEntry {
  status: FirmwareStatusPillKind;
  /**
   * i18n key path (e.g. `firmware_view.stages.transfer.label`) for the
   * stage label shown under the status pill when status === 'updating'.
   * The row component resolves this via t() — keeps localization at the
   * consumer rather than the producer.
   */
  stageLabelKey?: FirmwareStageLabelKey;
}

/**
 * Props for AstrosFirmwareControllersPanel.
 *
 * Phase-vs-fields correlation (documentation-only except where noted):
 *  - `progressByControllerId`: required in non-select phases; runtime-checked
 *    in dev by a watchEffect inside the panel
 *  - `doneCount`: only meaningful in `phase === 'done'`
 *  - `failedControllerLabel`, `failedStage`, `failedCount`: only meaningful
 *    in `phase === 'failed'`
 *
 * `failedStage` is narrowed to `FirmwareStage` (not `string`) so the panel
 * template's `t('firmware_view.stages.${failedStage}.label')` always
 * resolves to a valid i18n key.
 */
export interface ControllersPanelProps {
  phase: ControllersPanelPhase;
  /** Per-controller progress state keyed by SlotId; read in non-select phases. */
  progressByControllerId?: Partial<Record<SlotId, ControllerProgressEntry>>;
  /** Result bar count in `done` phase; falls back to `selectedControllerIds.size`. */
  doneCount?: number;
  /** Result bar label in `failed` phase. With multi-failure, the consumer joins labels comma-separated. */
  failedControllerLabel?: string;
  /** Result bar stage name in `failed` phase. Omitted when `failedCount > 1` because failures may span stages. */
  failedStage?: FirmwareStage;
  /** Number of failed controllers; controls singular vs multi result-bar copy. Defaults to 1. */
  failedCount?: number;
}
