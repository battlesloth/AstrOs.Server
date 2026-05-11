import type { FirmwareStatusPillKind } from '@/types/firmware';

export type ControllersPanelPhase = 'select' | 'flashing' | 'done' | 'failed';

export interface ControllerProgressEntry {
  status: FirmwareStatusPillKind;
  /** Stage label shown under the status pill when status === 'updating'. */
  stageLabel?: string;
}

export interface ControllersPanelProps {
  phase: ControllersPanelPhase;
  /** Per-controller progress state keyed by controller id. Required for non-`select` phases. */
  progressByControllerId?: Record<string, ControllerProgressEntry>;
  /** Result bar — `done` phase: count of controllers updated. */
  doneCount?: number;
  /** Result bar — `failed` phase: failing controller's label. */
  failedControllerLabel?: string;
  /** Result bar — `failed` phase: stage during which the failure occurred. */
  failedStage?: string;
}
