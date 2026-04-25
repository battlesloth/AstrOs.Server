// Typed client for /api/* — keep endpoint shapes in lockstep with src/web/server.ts.

export interface PadawanInfo {
  address: string;
  name: string;
}

export interface CockpitState {
  connected: boolean;
  port: string | null;
  baud: number | null;
  activeRunId: string | null;
  padawan: PadawanInfo | null;
}

export interface SerialPortInfo {
  path: string;
  manufacturer?: string;
  serialNumber?: string;
  productId?: string;
  vendorId?: string;
}

async function unwrap<T>(res: Response, defaultMessage: string): Promise<T> {
  if (res.ok) {
    return (await res.json()) as T;
  }
  const data = (await res.json().catch(() => ({}))) as { message?: string };
  throw new Error(data.message ?? `${defaultMessage}: ${res.status}`);
}

export async function getState(): Promise<CockpitState> {
  const res = await fetch('/api/state');
  return unwrap<CockpitState>(res, 'Failed to fetch state');
}

export async function getPorts(): Promise<SerialPortInfo[]> {
  const res = await fetch('/api/ports');
  const data = await unwrap<{ ports: SerialPortInfo[] }>(res, 'Failed to list ports');
  return data.ports;
}

export async function connect(port: string, baud: number): Promise<CockpitState> {
  const res = await fetch('/api/connect', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ port, baud }),
  });
  return unwrap<CockpitState>(res, 'Connect failed');
}

export async function disconnect(): Promise<void> {
  const res = await fetch('/api/disconnect', { method: 'POST' });
  await unwrap<{ ok: true }>(res, 'Disconnect failed');
}

export async function panic(): Promise<void> {
  const res = await fetch('/api/panic', { method: 'POST' });
  await unwrap<{ ok: boolean }>(res, 'Panic failed');
}

// Mirrors ScenarioSeverity in core/runner.ts; kept in sync by hand
// because the cockpit UI is built by Vite, not the same tsc pass.
// If you change the union here, update core/runner.ts to match (and vice versa).
export type ScenarioSeverity = 'safe' | 'caution' | 'destructive';

export interface ScenarioInfo {
  id: string;
  description: string;
  severity: ScenarioSeverity;
}

export async function getScenarios(): Promise<ScenarioInfo[]> {
  const res = await fetch('/api/scenarios');
  const data = await unwrap<{ scenarios: ScenarioInfo[] }>(res, 'Failed to list scenarios');
  return data.scenarios;
}

export async function runScenario(id: string, confirm = false): Promise<{ runId: string }> {
  const res = await fetch(`/api/run/${encodeURIComponent(id)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ confirm }),
  });
  return unwrap<{ runId: string }>(res, 'Run failed');
}
