import { SerialTransport } from '../core/transport.js';
import { discover } from '../cli/discovery.js';
import { broadcast, type PadawanInfo } from './sse.js';
import { createLogger } from '../core/log.js';

const log = createLogger('state');

export interface CockpitState {
  connected: boolean;
  port: string | null;
  baud: number | null;
  activeRunId: string | null;
  padawan: PadawanInfo | null;
}

export class PortInUseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PortInUseError';
  }
}
export class AlreadyConnectedError extends Error {
  constructor() {
    super('Already connected');
    this.name = 'AlreadyConnectedError';
  }
}
export class NotConnectedError extends Error {
  constructor() {
    super('Not connected');
    this.name = 'NotConnectedError';
  }
}

let transport: SerialTransport | null = null;
let currentRunId: string | null = null;
let currentState: CockpitState = {
  connected: false,
  port: null,
  baud: null,
  activeRunId: null,
  padawan: null,
};

function resetToDisconnected(): void {
  transport = null;
  currentRunId = null;
  currentState = {
    connected: false,
    port: null,
    baud: null,
    activeRunId: null,
    padawan: null,
  };
}

export function getState(): CockpitState {
  return { ...currentState };
}

export function getTransport(): SerialTransport | null {
  return transport;
}

export function setActiveRun(runId: string): void {
  currentRunId = runId;
  currentState = { ...currentState, activeRunId: runId };
}

export function clearActiveRun(): void {
  currentRunId = null;
  currentState = { ...currentState, activeRunId: null };
}

export async function connect(port: string, baud: number): Promise<CockpitState> {
  if (currentState.connected) throw new AlreadyConnectedError();

  log.debug('connect: opening transport', { port, baud });
  const t = new SerialTransport({ path: port, baudRate: baud });
  try {
    await t.open();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/(busy|temporarily unavailable|in use|access is denied|permission)/i.test(msg)) {
      throw new PortInUseError(`Port ${port} is in use; stop AstrOs.Server first.`);
    }
    throw err;
  }

  // Wire transport events to SSE before any traffic flows so discovery is visible.
  // Closures capture the `currentRunId` binding so events emitted while a run
  // is active get tagged with that run's id and bucket into its transcript tab.
  t.on('tx', (bytes) => broadcast({ kind: 'txBytes', bytes, runId: currentRunId ?? undefined }));
  t.on('line', (line) =>
    broadcast({ kind: 'rxBytes', bytes: line, runId: currentRunId ?? undefined }),
  );
  t.on('error', (err) =>
    broadcast({ kind: 'error', message: err.message, runId: currentRunId ?? undefined }),
  );
  t.on('close', () => {
    // Distinguish unexpected close (USB unplug, OS closed FD) from the echo
    // of a user-initiated disconnect(). disconnect() nulls the module-level
    // `transport` *before* awaiting close, so when the close event arrives
    // for an explicit disconnect the captured local `t` no longer matches —
    // bail to avoid double-broadcasting `disconnected`.
    if (transport !== t) return;
    log.warn('serial port closed unexpectedly');
    resetToDisconnected();
    broadcast({ kind: 'error', message: 'Serial port closed unexpectedly' });
    broadcast({ kind: 'disconnected' });
  });

  transport = t;

  // Run discovery (best effort — port stays open even if no padawan responds).
  let padawan: PadawanInfo | null = null;
  try {
    log.debug('discovery starting');
    const disc = await discover(t);
    if (disc.padawan) {
      padawan = { address: disc.padawan.address, name: disc.padawan.name };
      log.debug('discovery found padawan', { address: padawan.address, name: padawan.name });
    } else {
      log.debug('discovery completed with no padawan');
    }
  } catch (err) {
    // discovery failure is non-fatal
    log.debug('discovery failed (non-fatal)', {
      err: err instanceof Error ? err.message : String(err),
    });
  }

  currentState = { connected: true, port, baud, activeRunId: null, padawan };
  log.info('connected', { port, baud, padawan: padawan?.address ?? null });
  broadcast({ kind: 'connected', port, baud, padawan });
  return getState();
}

export async function disconnect(): Promise<void> {
  const t = transport;
  if (!t) throw new NotConnectedError();
  log.debug('disconnect: closing transport');
  // Reset state synchronously *before* awaiting close so the close handler
  // (which compares its captured `t` to module-level `transport`) treats this
  // as user-initiated and bails — no double `disconnected` broadcast.
  resetToDisconnected();
  await t.close();
  log.info('disconnected');
  broadcast({ kind: 'disconnected' });
}
