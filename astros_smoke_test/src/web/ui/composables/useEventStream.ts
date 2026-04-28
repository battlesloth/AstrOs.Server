import { onMounted, onUnmounted, ref } from 'vue';
import type { PadawanInfo } from '../api';

// Mirrors the CockpitEvent union in src/web/sse.ts. Keep in sync.
// `StepResultLite` matches a subset of the runner's StepResult — we don't
// import StepResult itself in the UI to avoid coupling Vue code to core/.
export interface StepResultLite {
  ok: boolean;
  timedOut?: boolean;
  detail?: string;
  messageId?: string;
  ackType?: number;
  durationMs: number;
  rawResponse?: string;
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
  | { kind: 'stepOk'; runId: string; phase: string; step: string; result: StepResultLite }
  | { kind: 'stepFail'; runId: string; phase: string; step: string; result: StepResultLite }
  | { kind: 'stepTimeout'; runId: string; phase: string; step: string; result: StepResultLite };

export function useEventStream() {
  const events = ref<CockpitEvent[]>([]);
  const sseConnected = ref(false);
  let source: EventSource | null = null;

  function start(): void {
    source = new EventSource('/api/events');
    source.onopen = () => {
      sseConnected.value = true;
    };
    source.onerror = () => {
      sseConnected.value = false;
    };
    source.onmessage = (msg) => {
      try {
        events.value.push(JSON.parse(msg.data) as CockpitEvent);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('Bad SSE event', err, msg.data);
      }
    };
  }

  function stop(): void {
    source?.close();
    source = null;
    sseConnected.value = false;
  }

  onMounted(start);
  onUnmounted(stop);

  return { events, sseConnected };
}
