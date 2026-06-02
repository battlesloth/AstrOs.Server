import { StatusResponse, TransmissionType, type LocationName } from 'src/models/index.js';

/** How long a controller may be silent (no POLL_ACK) before it is marked DOWN. */
export const STATUS_STALE_TIMEOUT_MS = 10_000;
/** How often the staleness sweep runs. */
export const STATUS_SWEEP_INTERVAL_MS = 2_000;

/** The identity a DOWN broadcast needs, captured from each POLL_ACK. */
export interface ControllerIdentity {
  controllerId: string;
  controllerAddress: string;
  controllerLocation: LocationName; // body | core | dome — the key the frontend reads
}

/**
 * Tracks controller liveness from POLL_ACK timestamps and decides which
 * controllers have gone silent. Pure logic: the caller passes `now` and does the
 * broadcasting — no serial/DB/WS/Date.now() here, so it is fully unit-testable.
 *
 * Edge-triggered: a controller emits one DOWN on the up->down transition (via the
 * `down` set), not once per sweep, preventing WS spam and UI flapping.
 */
export class ControllerWatchdog {
  private readonly lastSeen = new Map<string, { id: ControllerIdentity; at: number }>();
  private readonly down = new Set<string>();

  constructor(private readonly staleTimeoutMs: number = STATUS_STALE_TIMEOUT_MS) {}

  /** A POLL_ACK arrived: stamp last-seen and clear any DOWN flag. */
  recordAck(id: ControllerIdentity, now: number): void {
    this.lastSeen.set(id.controllerId, { id, at: now });
    this.down.delete(id.controllerId);
  }

  /**
   * Periodic check: return controllers silent longer than the timeout that are
   * not already flagged, marking them DOWN. Caller broadcasts each as up:false.
   */
  sweep(now: number): ControllerIdentity[] {
    const newlyDown: ControllerIdentity[] = [];
    for (const [controllerId, entry] of this.lastSeen) {
      if (this.down.has(controllerId)) {
        continue;
      }
      if (now - entry.at > this.staleTimeoutMs) {
        this.down.add(controllerId);
        newlyDown.push(entry.id);
      }
    }
    return newlyDown;
  }

  /**
   * Serial close/error fast-path: return every seen controller not already
   * flagged, marking them DOWN. They stay down until a fresh recordAck.
   * Subsequent calls without an intervening recordAck return [] (idempotent).
   */
  markAllDown(): ControllerIdentity[] {
    const newlyDown: ControllerIdentity[] = [];
    for (const [controllerId, entry] of this.lastSeen) {
      if (this.down.has(controllerId)) {
        continue;
      }
      this.down.add(controllerId);
      newlyDown.push(entry.id);
    }
    return newlyDown;
  }
}

/** Synthesize the DOWN StatusResponse the UI renders as ControllerStatus.DOWN. */
export function buildDownStatus(id: ControllerIdentity): StatusResponse {
  return {
    type: TransmissionType.status,
    success: true,
    message: '',
    controllerId: id.controllerId,
    controllerAddress: id.controllerAddress,
    controllerLocation: id.controllerLocation,
    up: false,
    synced: false,
    firmwareCompatible: false,
  };
}
