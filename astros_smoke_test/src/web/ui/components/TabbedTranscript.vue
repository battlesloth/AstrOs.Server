<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { CockpitEvent } from '../composables/useEventStream';
import type { Tab } from '../composables/useRuns';

const props = defineProps<{
  tabs: Tab[];
  hidePollAck: boolean;
}>();

const POLL_ACK_HEADER = '\u001ePOLL_ACK\u001e';

const activeId = ref<string>('background');

// Auto-switch to a freshly-created run tab if the user is currently on
// Background (most common: clicked Run, want to see what happens).
watch(
  () => props.tabs.length,
  (now, prev) => {
    if (now > prev) {
      const last = props.tabs[props.tabs.length - 1];
      if (last.kind === 'run' && activeId.value === 'background') {
        activeId.value = last.runId;
      }
    }
  },
);

const activeTab = computed<Tab | undefined>(() => {
  if (activeId.value === 'background') return props.tabs.find((t) => t.kind === 'background');
  return props.tabs.find((t) => t.kind === 'run' && t.runId === activeId.value);
});

function isPollAck(ev: CockpitEvent): boolean {
  if (ev.kind !== 'txBytes' && ev.kind !== 'rxBytes') return false;
  return ev.bytes.includes(POLL_ACK_HEADER);
}

const visibleEvents = computed<CockpitEvent[]>(() => {
  const tab = activeTab.value;
  if (!tab) return [];
  if (!props.hidePollAck) return tab.events;
  return tab.events.filter((ev) => !isPollAck(ev));
});

const hiddenCount = computed<number>(() => {
  const tab = activeTab.value;
  if (!tab || !props.hidePollAck) return 0;
  return tab.events.length - visibleEvents.value.length;
});

function tabLabel(t: Tab): string {
  if (t.kind === 'background') return 'Background';
  return t.scenarioId;
}

function tabStatusTone(t: Tab): string {
  if (t.kind === 'background') return 'gray';
  if (t.status === 'ok') return 'green';
  if (t.status === 'fail') return 'red';
  return 'amber';
}

function eventLabel(kind: string): string {
  switch (kind) {
    case 'connected':
      return 'connect';
    case 'disconnected':
      return 'disconnect';
    case 'error':
      return 'error';
    case 'txBytes':
      return 'TX';
    case 'rxBytes':
      return 'RX';
    case 'runStarted':
      return 'run';
    case 'scenarioDone':
      return 'done';
    case 'stepStart':
      return 'step';
    case 'stepOk':
      return 'ok';
    case 'stepFail':
      return 'FAIL';
    case 'stepTimeout':
      return 'TIMEOUT';
    default:
      return kind;
  }
}

function eventDetail(ev: CockpitEvent): string {
  switch (ev.kind) {
    case 'txBytes':
    case 'rxBytes':
      return ev.bytes;
    case 'error':
      return ev.message;
    case 'connected':
      return `${ev.port} @ ${ev.baud}` + (ev.padawan ? ` · padawan ${ev.padawan.address}` : '');
    case 'disconnected':
      return '';
    case 'runStarted':
      return `${ev.scenarioId} — ${ev.description}`;
    case 'scenarioDone':
      return ev.ok ? 'OK' : 'FAIL';
    case 'stepStart':
      return `[${ev.phase}] ${ev.step}`;
    case 'stepOk':
    case 'stepFail':
    case 'stepTimeout': {
      const id = ev.result.messageId ? ` msg=${ev.result.messageId.slice(0, 8)}` : '';
      const detail = ev.result.detail ? `  ${ev.result.detail}` : '';
      return `[${ev.phase}] ${ev.step}  ${ev.result.durationMs}ms${id}${detail}`;
    }
    default:
      return '';
  }
}
</script>

<template>
  <section class="transcript">
    <nav
      class="tabstrip"
      role="tablist"
    >
      <button
        v-for="t in props.tabs"
        :key="t.kind === 'background' ? 'background' : t.runId"
        role="tab"
        class="tab"
        :class="{
          active:
            (t.kind === 'background' && activeId === 'background') ||
            (t.kind === 'run' && t.runId === activeId),
        }"
        :data-tone="tabStatusTone(t)"
        @click="activeId = t.kind === 'background' ? 'background' : t.runId"
      >
        <span class="tab-label">{{ tabLabel(t) }}</span>
        <span
          v-if="t.kind === 'run'"
          class="tab-status"
          :data-status="t.status"
          >{{ t.status === 'running' ? '…' : t.status === 'ok' ? '✓' : '✕' }}</span
        >
      </button>
    </nav>

    <div class="content">
      <p
        v-if="visibleEvents.length === 0"
        class="muted empty"
      >
        <span v-if="activeTab && activeTab.kind === 'background'"
          >Background events appear here. Connect or run a scenario to see traffic.</span
        >
        <span v-else>No events yet…</span>
      </p>
      <ul
        v-else
        class="event-log"
      >
        <li
          v-for="(ev, i) in visibleEvents"
          :key="i"
          :class="`event-${ev.kind}`"
        >
          <span class="kind">{{ eventLabel(ev.kind) }}</span>
          <span class="detail">{{ eventDetail(ev) }}</span>
        </li>
      </ul>
      <p
        v-if="hiddenCount > 0"
        class="muted hidden-note"
      >
        ({{ hiddenCount }} POLL_ACK hidden)
      </p>
    </div>
  </section>
</template>

<style scoped>
  .transcript {
    display: grid;
    grid-template-rows: auto 1fr;
    height: 100%;
    overflow: hidden;
  }

  .tabstrip {
    display: flex;
    gap: 0.25rem;
    padding: 0.5rem 0.75rem 0;
    background: #0d1117;
    border-bottom: 1px solid #30363d;
    overflow-x: auto;
  }

  .tab {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    background: #161b22;
    border: 1px solid #30363d;
    border-bottom: none;
    border-radius: 6px 6px 0 0;
    color: #c9d1d9;
    font: inherit;
    font-size: 0.8rem;
    padding: 0.4rem 0.75rem;
    cursor: pointer;
    white-space: nowrap;
  }
  .tab:hover {
    color: #fff;
  }
  .tab.active {
    background: #0d1117;
    border-color: #58a6ff;
    color: #58a6ff;
  }
  .tab-status {
    font-size: 0.75rem;
  }
  .tab-status[data-status='ok'] {
    color: #7ee787;
  }
  .tab-status[data-status='fail'] {
    color: #f85149;
  }
  .tab-status[data-status='running'] {
    color: #f0883e;
  }

  .content {
    overflow-y: auto;
    padding: 0.5rem 0.75rem;
  }
  .empty {
    margin: 1rem 0;
    font-size: 0.85rem;
  }
  .muted {
    color: #8b949e;
  }
  .hidden-note {
    margin: 0.5rem 0 0;
    font-size: 0.75rem;
  }

  .event-log {
    list-style: none;
    padding: 0;
    margin: 0;
  }
  .event-log li {
    display: grid;
    grid-template-columns: 7ch 1fr;
    gap: 0.75rem;
    padding: 0.25rem 0;
    border-bottom: 1px solid #21262d;
    font-size: 0.85rem;
  }
  .kind {
    color: #58a6ff;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    font-size: 0.75rem;
    padding-top: 0.15rem;
  }
  .event-log li.event-error .kind {
    color: #f85149;
  }
  .event-log li.event-rxBytes .kind {
    color: #d2a8ff;
  }
  .event-log li.event-txBytes .kind {
    color: #79c0ff;
  }
  .event-log li.event-connected .kind,
  .event-log li.event-stepOk .kind,
  .event-log li.event-runStarted .kind {
    color: #7ee787;
  }
  .event-log li.event-disconnected .kind {
    color: #8b949e;
  }
  .event-log li.event-stepFail .kind,
  .event-log li.event-stepTimeout .kind {
    color: #f85149;
  }
  .event-log li.event-scenarioDone .kind {
    color: #f0883e;
  }
  .event-log li.event-stepStart .kind {
    color: #8b949e;
  }
  .detail {
    word-break: break-all;
    color: #c9d1d9;
    white-space: pre-wrap;
  }
</style>
