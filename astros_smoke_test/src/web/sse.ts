import type { Response } from 'express';

// Single SSE channel: every connected /api/events client receives every event.
// Filtering by runId / kind is the client's job (Task 3+ uses runId to bucket
// events into per-run transcript tabs).

export type CockpitEvent =
  | { kind: 'connected'; port: string; baud: number; padawan: PadawanInfo | null }
  | { kind: 'disconnected' }
  | { kind: 'error'; message: string }
  | { kind: 'txBytes'; bytes: string; runId?: string }
  | { kind: 'rxBytes'; bytes: string; runId?: string };

export interface PadawanInfo {
  address: string;
  name: string;
}

const subscribers = new Set<Response>();

export function addSubscriber(res: Response): void {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();
  // Immediate flush so the EventSource readyState transitions to OPEN.
  res.write(': hello\n\n');
  subscribers.add(res);
}

export function removeSubscriber(res: Response): void {
  subscribers.delete(res);
}

export function broadcast(event: CockpitEvent): void {
  const data = `data: ${JSON.stringify(event)}\n\n`;
  for (const res of subscribers) {
    try {
      res.write(data);
    } catch {
      subscribers.delete(res);
    }
  }
}
