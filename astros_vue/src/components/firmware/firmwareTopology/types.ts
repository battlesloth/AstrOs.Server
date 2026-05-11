export type TopologyPhase = 'idle' | 'select' | 'flashing' | 'done' | 'failed';

export interface TopologyController {
  id: string;
  label: string;
}

/**
 * Presentation-layer view of the fleet: one master controller plus up to two
 * padawans. Encoding the master/padawan split in the type makes a missing
 * master unrepresentable and removes the silent-drop behavior that a flat
 * controllers list would need.
 *
 * Extra padawans beyond `[0..1]` are not rendered (only two slots exist in
 * the SVG layout); callers are expected to pass at most two.
 */
export interface TopologyFleet {
  master: TopologyController;
  padawans: readonly TopologyController[];
}

export interface TopologyProps {
  fleet: TopologyFleet;
  /**
   * Controller ids currently selected for the flash. The component builds an internal Set
   * from this list, so pass a *new array* on each change — Vue reactivity tracks the array
   * reference, not in-place mutations. Ids that don't match any controller in the fleet are
   * harmless (treated as unselected).
   */
  selectedIds: readonly string[];
  /** Firmware tag rendered in the source rect ('—' when null). Must be non-null in non-`select` phases. */
  target: string | null;
  phase: TopologyPhase;
  /**
   * Controller id whose red `!` glyph renders when `phase === 'failed'`. The stroke also turns
   * red if the controller is in `selectedIds` (a failed controller is expected to have been
   * selected for flashing). Consulted only when `phase === 'failed'`; otherwise ignored.
   */
  failedControllerId?: string;
}
