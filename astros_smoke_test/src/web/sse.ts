import type { Response } from 'express';
import type { StepResult } from '../core/runner.js';
import { createLogger } from '../core/log.js';

const log = createLogger('sse');

// Single SSE channel: every connected /api/events client receives every event.
// The client buckets events into transcript tabs by runId; events without a
// runId belong to the Background tab (connection events, between-run bytes).

export interface PadawanInfo {
  address: string;
  name: string;
}

export type CockpitEvent =
  | { kind: 'connected'; port: string; baud: number; padawan: PadawanInfo | null }
  | { kind: 'disconnected' }
  | { kind: 'error'; message: string; runId?: string }
  | { kind: 'txBytes'; bytes: string; runId?: string }
  | { kind: 'rxBytes'; bytes: string; runId?: string }
  | { kind: 'runStarted'; runId: string; scenarioId: string; description: string }
  | { kind: 'scenarioDone'; runId: string; ok: boolean }
  | { kind: 'stepStart'; runId: string; phase: string; step: string }
  | { kind: 'stepOk'; runId: string; phase: string; step: string; result: StepResult }
  | { kind: 'stepFail'; runId: string; phase: string; step: string; result: StepResult }
  | { kind: 'stepTimeout'; runId: string; phase: string; step: string; result: StepResult };

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
  log.debug('subscriber added', { count: subscribers.size });
}

export function removeSubscriber(res: Response): void {
  subscribers.delete(res);
  log.debug('subscriber removed', { count: subscribers.size });
}

export function broadcast(event: CockpitEvent): void {
  const data = `data: ${JSON.stringify(event)}\n\n`;
  log.debug('broadcast', { kind: event.kind, subscribers: subscribers.size });
  for (const res of subscribers) {
    try {
      res.write(data);
    } catch {
      subscribers.delete(res);
    }
  }
}
