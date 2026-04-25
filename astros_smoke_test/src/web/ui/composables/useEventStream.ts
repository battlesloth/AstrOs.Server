import { onMounted, onUnmounted, ref } from 'vue';
import type { PadawanInfo } from '../api';

// Mirrors the CockpitEvent union in src/web/sse.ts. Keep in sync.
export type CockpitEvent =
  | { kind: 'connected'; port: string; baud: number; padawan: PadawanInfo | null }
  | { kind: 'disconnected' }
  | { kind: 'error'; message: string }
  | { kind: 'txBytes'; bytes: string; runId?: string }
  | { kind: 'rxBytes'; bytes: string; runId?: string };

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
