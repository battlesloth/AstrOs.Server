import type {
  FirmwarePhase,
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

export interface ControllersPanelProps {
  phase: ControllersPanelPhase;
  /** Per-controller progress state keyed by SlotId; read in non-select phases. */
  progressByControllerId?: Partial<Record<SlotId, ControllerProgressEntry>>;
  /** Result bar count in `done` phase; falls back to `selectedControllerIds.size`. */
  doneCount?: number;
  /** Result bar label in `failed` phase. With multi-failure, the consumer joins labels comma-separated. */
  failedControllerLabel?: string;
  /** Result bar stage name in `failed` phase. Omitted when `failedCount > 1` because failures may span stages. */
  failedStage?: string;
  /** Number of failed controllers; controls singular vs multi result-bar copy. Defaults to 1. */
  failedCount?: number;
}
