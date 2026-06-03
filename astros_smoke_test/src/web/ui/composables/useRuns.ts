import { computed, type Ref } from 'vue';
import type { CockpitEvent } from './useEventStream';

export type RunStatus = 'running' | 'ok' | 'fail';

export interface RunTab {
  kind: 'run';
  runId: string;
  scenarioId: string;
  description: string;
  status: RunStatus;
  events: CockpitEvent[];
}

export interface BackgroundTab {
  kind: 'background';
  events: CockpitEvent[];
}

export type Tab = BackgroundTab | RunTab;

function eventRunId(ev: CockpitEvent): string | undefined {
  return (ev as { runId?: string }).runId;
}

// Reduce the SSE event log into a [Background, ...runs] tab list. Pure
// derivation — no side effects, no per-mount setup. Vue's reactivity caches
// the computation until events.value changes.
export function useRuns(events: Ref<CockpitEvent[]>) {
  const tabs = computed<Tab[]>(() => {
    const background: CockpitEvent[] = [];
    const runs = new Map<string, RunTab>();

    for (const ev of events.value) {
      if (ev.kind === 'runStarted') {
        runs.set(ev.runId, {
          kind: 'run',
          runId: ev.runId,
          scenarioId: ev.scenarioId,
          description: ev.description,
          status: 'running',
          events: [ev],
        });
        continue;
      }

      const id = eventRunId(ev);
      if (id !== undefined && runs.has(id)) {
        const run = runs.get(id) as RunTab;
        run.events.push(ev);
        if (ev.kind === 'scenarioDone') {
          run.status = ev.ok ? 'ok' : 'fail';
        }
      } else {
        background.push(ev);
      }
    }

    return [{ kind: 'background', events: background }, ...runs.values()];
  });

  return { tabs };
}
