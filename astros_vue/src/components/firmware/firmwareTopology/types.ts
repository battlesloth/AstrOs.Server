import type { FirmwarePhase, FirmwareStage } from '@/types/firmware';

export type TopologyPhase = FirmwarePhase;
export type TopologyStage = FirmwareStage;

export interface TopologyController {
  id: string;
  label: string;
}

/**
 * Master/padawan split is encoded in the type so a missing master is
 * unrepresentable. Only the first two padawans render (SVG has two slots).
 */
export interface TopologyFleet {
  master: TopologyController;
  padawans: readonly TopologyController[];
}

export interface TopologyProps {
  fleet: TopologyFleet;
  /** Pass a new array on each change — Vue tracks the array reference, not in-place mutations. */
  selectedIds: readonly string[];
  /** Must be non-null whenever `phase !== 'select'`. */
  target: string | null;
  phase: TopologyPhase;
  /**
   * Sub-phase signal used only when `phase === 'flashing'` to distinguish
   * the serial-upload step (`'download'`, or `null` before the first
   * controller-update lands) from later steps. During serial upload only
   * the source → master line animates; the master → padawan lines stay
   * solid because no ESP-NOW traffic is flowing yet. Optional in
   * non-flashing phases.
   */
  currentStage?: TopologyStage | null;
  /** Consulted only when `phase === 'failed'`. Stroke turns red only if this id is also in `selectedIds`. */
  failedControllerId?: string;
}
