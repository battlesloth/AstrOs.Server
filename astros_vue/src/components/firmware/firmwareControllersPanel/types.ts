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
 * Phase-vs-fields correlation (documented; only `progressByControllerId`
 * is enforced at runtime by the dev-only watchEffect in the panel
 * component — the result-bar fields below are documentation-only and
 * the consumer is responsible for setting them in the right phase):
 *  - `progressByControllerId`: required in non-select phases (flashing/done/failed) — runtime-checked in dev
 *  - `doneCount`: only meaningful in `phase === 'done'`
 *  - `failedControllerLabel`, `failedStage`, `failedCount`: only meaningful in `phase === 'failed'`
 *
 * IM-12: `failedStage` is narrowed to `FirmwareStage` so the panel
 * template's `t('firmware_view.stages.${failedStage}.label')` always
 * resolves to a known i18n key path.
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
