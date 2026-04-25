<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import TopBar from './components/TopBar.vue';
import { useEventStream, type CockpitEvent } from './composables/useEventStream';

const { events, sseConnected } = useEventStream();

// POLL_ACK fires every ~2s while connected (master polls each padawan via
// ESP-NOW and forwards the ack to the host). Filtering only affects display;
// the underlying events array is preserved so the toggle is reversible.
const POLL_ACK_HEADER = '\u001ePOLL_ACK\u001e';
const hidePollAck = ref<boolean>(localStorage.getItem('smoke.hidePollAck') === 'true');
watch(hidePollAck, (v) => {
  localStorage.setItem('smoke.hidePollAck', String(v));
});

function isPollAck(ev: CockpitEvent): boolean {
  if (ev.kind !== 'txBytes' && ev.kind !== 'rxBytes') return false;
  return ev.bytes.includes(POLL_ACK_HEADER);
}

const visible = computed(() =>
  hidePollAck.value ? events.value.filter((ev) => !isPollAck(ev)) : events.value,
);

// Show most recent first; cap at 200 to keep DOM small until Task 3
// replaces this with proper tabs.
const recent = computed(() => visible.value.slice(-200).slice().reverse());
const hiddenCount = computed(() => events.value.length - visible.value.length);

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
    default:
      return kind;
  }
}

function eventDetail(ev: { kind: string; [k: string]: unknown }): string {
  if (ev.kind === 'txBytes' || ev.kind === 'rxBytes') {
    return String(ev.bytes ?? '');
  }
  if (ev.kind === 'error') {
    return String(ev.message ?? '');
  }
  if (ev.kind === 'connected') {
    return `${ev.port} @ ${ev.baud}` + (ev.padawan ? ` · padawan ${(ev.padawan as { address: string }).address}` : '');
  }
  return '';
}
</script>

<template>
  <TopBar :events="events" />
  <main>
    <section>
      <header class="section-header">
        <h2>Background</h2>
        <span
          class="sse-pill"
          :data-tone="sseConnected ? 'green' : 'gray'"
          >SSE {{ sseConnected ? 'live' : 'offline' }}</span
        >
        <label class="filter-toggle">
          <input
            v-model="hidePollAck"
            type="checkbox"
          />
          hide POLL_ACK
          <span
            v-if="hidePollAck && hiddenCount > 0"
            class="muted"
            >({{ hiddenCount }} hidden)</span
          >
        </label>
      </header>
      <p
        v-if="events.length === 0"
        class="muted"
      >
        No events yet. Click Connect to start a serial session.
      </p>
      <ul
        v-else
        class="event-log"
      >
        <li
          v-for="(ev, i) in recent"
          :key="recent.length - i"
          :class="`event-${ev.kind}`"
        >
          <span class="kind">{{ eventLabel(ev.kind) }}</span>
          <span class="detail">{{ eventDetail(ev) }}</span>
        </li>
      </ul>
    </section>
  </main>
</template>

<style>
  body {
    margin: 0;
    font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
    background: #0d1117;
    color: #e6edf3;
    line-height: 1.5;
  }

  main {
    padding: 1rem;
  }

  .section-header {
    display: flex;
    align-items: baseline;
    gap: 0.75rem;
    margin-bottom: 0.5rem;
  }

  h1,
  h2 {
    margin: 0;
  }

  h2 {
    font-size: 0.85rem;
    color: #7ee787;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .muted {
    color: #8b949e;
  }

  .sse-pill {
    font-size: 0.75rem;
    padding: 0.1rem 0.5rem;
    border-radius: 999px;
  }
  .sse-pill[data-tone='green'] {
    background: #238636;
    color: #fff;
  }
  .sse-pill[data-tone='gray'] {
    background: #30363d;
    color: #8b949e;
  }

  .filter-toggle {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.8rem;
    color: #c9d1d9;
    cursor: pointer;
    user-select: none;
  }
  .filter-toggle input {
    cursor: pointer;
  }

  .event-log {
    list-style: none;
    padding: 0;
    margin: 0;
    border-top: 1px solid #30363d;
  }
  .event-log li {
    display: grid;
    grid-template-columns: 7ch 1fr;
    gap: 0.75rem;
    padding: 0.3rem 0;
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
  .event-log li.event-connected .kind {
    color: #7ee787;
  }
  .event-log li.event-disconnected .kind {
    color: #8b949e;
  }

  .detail {
    word-break: break-all;
    color: #c9d1d9;
    white-space: pre-wrap;
  }
</style>
