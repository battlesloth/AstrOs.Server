import type { FirmwarePhase, FirmwareStatusPillKind } from '@/types/firmware';

export type ControllersPanelPhase = Exclude<FirmwarePhase, 'idle'>;

export interface ControllerProgressEntry {
  status: FirmwareStatusPillKind;
  /**
   * i18n key path (e.g. `firmware_view.stages.transfer.label`) for the
   * stage label shown under the status pill when status === 'updating'.
   * The row component resolves this via t() — keeps localization at the
   * consumer rather than the producer.
   */
  stageLabelKey?: string;
}

export interface ControllersPanelProps {
  phase: ControllersPanelPhase;
  /** Per-controller progress state keyed by controller id; read in non-select phases. */
  progressByControllerId?: Record<string, ControllerProgressEntry>;
  /** Result bar count in `done` phase; falls back to `selectedControllerIds.size`. */
  doneCount?: number;
  /** Result bar label in `failed` phase. */
  failedControllerLabel?: string;
  /** Result bar stage name in `failed` phase. */
  failedStage?: string;
}
