export type TopologyPhase = 'select' | 'flashing' | 'done' | 'failed';

export interface TopologyController {
  id: string;
  label: string;
}

/**
 * Invariant: `controllers` is expected to be exactly the fleet (one master + two padawans).
 * The component renders at most the first two non-master entries; additional controllers
 * are dropped silently.
 */
export interface TopologyProps {
  controllers: TopologyController[];
  selectedIds: Record<string, boolean>;
  target: string | null;
  phase: TopologyPhase;
  failedControllerId?: string | null;
  masterControllerId?: string;
}
