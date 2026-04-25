import { SerialTransport } from '../core/transport.js';
import { discover } from '../cli/discovery.js';
import { broadcast, type PadawanInfo } from './sse.js';

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
let currentState: CockpitState = {
  connected: false,
  port: null,
  baud: null,
  activeRunId: null,
  padawan: null,
};

export function getState(): CockpitState {
  return { ...currentState };
}

export function getTransport(): SerialTransport | null {
  return transport;
}

export async function connect(port: string, baud: number): Promise<CockpitState> {
  if (currentState.connected) throw new AlreadyConnectedError();

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
  t.on('tx', (bytes) => broadcast({ kind: 'txBytes', bytes }));
  t.on('line', (line) => broadcast({ kind: 'rxBytes', bytes: line }));
  t.on('error', (err) => broadcast({ kind: 'error', message: err.message }));

  transport = t;

  // Run discovery (best effort — port stays open even if no padawan responds).
  let padawan: PadawanInfo | null = null;
  try {
    const disc = await discover(t);
    if (disc.padawan) {
      padawan = { address: disc.padawan.address, name: disc.padawan.name };
    }
  } catch {
    // discovery failure is non-fatal
  }

  currentState = { connected: true, port, baud, activeRunId: null, padawan };
  broadcast({ kind: 'connected', port, baud, padawan });
  return getState();
}

export async function disconnect(): Promise<void> {
  if (!transport) throw new NotConnectedError();
  await transport.close();
  transport = null;
  currentState = {
    connected: false,
    port: null,
    baud: null,
    activeRunId: null,
    padawan: null,
  };
  broadcast({ kind: 'disconnected' });
}
