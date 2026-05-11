export type TopologyPhase = 'idle' | 'select' | 'flashing' | 'done' | 'failed';

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
  /** Consulted only when `phase === 'failed'`. Stroke turns red only if this id is also in `selectedIds`. */
  failedControllerId?: string;
}
