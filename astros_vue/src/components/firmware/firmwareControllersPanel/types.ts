import type { FirmwareStatusPillKind } from '@/types/firmware';

export type ControllersPanelPhase = 'select' | 'flashing' | 'done' | 'failed';

export interface ControllerProgressEntry {
  status: FirmwareStatusPillKind;
  /** Stage label shown under the status pill when status === 'updating'. */
  stageLabel?: string;
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
