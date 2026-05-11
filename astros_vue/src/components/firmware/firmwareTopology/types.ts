export type TopologyPhase = 'select' | 'flashing' | 'done' | 'failed';

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
  /** Set of controller ids currently selected for the flash. Missing ids are unselected. */
  selectedIds: ReadonlySet<string>;
  /** Firmware tag rendered in the source rect ('—' when null). Must be non-null in non-`select` phases. */
  target: string | null;
  phase: TopologyPhase;
  /** Controller id whose red `!` glyph + red stroke render when `phase === 'failed'`. */
  failedControllerId?: string;
}
