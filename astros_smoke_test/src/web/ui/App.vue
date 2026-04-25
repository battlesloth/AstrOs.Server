<script setup lang="ts">
import { computed, provide, ref, watch } from 'vue';
import TopBar from './components/TopBar.vue';
import ScenarioList from './components/ScenarioList.vue';
import TabbedTranscript from './components/TabbedTranscript.vue';
import ConfirmModal from './components/ConfirmModal.vue';
import { useEventStream } from './composables/useEventStream';
import { useRuns } from './composables/useRuns';
import { ConnectionKey, useConnection } from './composables/useConnection';
import * as api from './api';
import type { ScenarioInfo } from './api';

const { events, sseConnected } = useEventStream();
const { tabs } = useRuns(events);

// Single source of truth for connection state. Provided to descendants
// (TopBar, etc.) via ConnectionKey so they don't instantiate their own
// useConnection() with duplicate refs and onMounted fetches.
const connection = useConnection();
provide(ConnectionKey, connection);
const { state, refreshState } = connection;

watch(
  () => events.value.length,
  () => {
    const last = events.value[events.value.length - 1];
    if (!last) return;
    if (last.kind === 'connected' || last.kind === 'disconnected' || last.kind === 'scenarioDone' || last.kind === 'runStarted') {
      void refreshState();
    }
  },
);

const hidePollAck = ref<boolean>(localStorage.getItem('smoke.hidePollAck') === 'true');
watch(hidePollAck, (v) => {
  localStorage.setItem('smoke.hidePollAck', String(v));
});

const pendingScenario = ref<ScenarioInfo | null>(null);
const runError = ref<string | null>(null);

async function fireRun(scenario: ScenarioInfo, confirm: boolean): Promise<void> {
  runError.value = null;
  try {
    await api.runScenario(scenario.id, confirm);
  } catch (err) {
    runError.value = err instanceof Error ? err.message : String(err);
  }
}

function onScenarioRun(scenario: ScenarioInfo): void {
  if (scenario.severity === 'destructive') {
    pendingScenario.value = scenario;
    return;
  }
  void fireRun(scenario, false);
}

function onConfirmRun(): void {
  const s = pendingScenario.value;
  pendingScenario.value = null;
  if (s) void fireRun(s, true);
}

function onCancelRun(): void {
  pendingScenario.value = null;
}

const isConnected = computed<boolean>(() => state.value?.connected === true);
const activeRunId = computed<string | null>(() => state.value?.activeRunId ?? null);
</script>

<template>
  <TopBar />
  <p
    v-if="runError"
    class="run-error"
    role="alert"
  >
    {{ runError }}
  </p>
  <div class="layout">
    <ScenarioList
      :connected="isConnected"
      :active-run-id="activeRunId"
      @run="onScenarioRun"
    />
    <TabbedTranscript
      :tabs="tabs"
      :hide-poll-ack="hidePollAck"
    />
    <aside class="inspector">
      <header class="section-header">
        <h2>Inspector</h2>
        <span
          class="sse-pill"
          :data-tone="sseConnected ? 'green' : 'gray'"
          >SSE {{ sseConnected ? 'live' : 'offline' }}</span
        >
      </header>
      <label class="filter-toggle">
        <input
          v-model="hidePollAck"
          type="checkbox"
        />
        hide POLL_ACK
      </label>
      <p class="muted placeholder">Transport inspector lands in Task 4.</p>
    </aside>
  </div>

  <ConfirmModal
    :open="pendingScenario !== null"
    :scenario-id="pendingScenario?.id ?? ''"
    :description="pendingScenario?.description ?? ''"
    @confirm="onConfirmRun"
    @cancel="onCancelRun"
  />
</template>

<style>
  body {
    margin: 0;
    font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
    background: #0d1117;
    color: #e6edf3;
    line-height: 1.5;
    height: 100vh;
    overflow: hidden;
  }
  #app {
    display: grid;
    grid-template-rows: auto auto 1fr;
    height: 100vh;
  }
  .layout {
    display: grid;
    grid-template-columns: 240px 1fr 280px;
    overflow: hidden;
  }

  .inspector {
    padding: 1rem;
    border-left: 1px solid #30363d;
    overflow-y: auto;
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
  .placeholder {
    font-size: 0.8rem;
    margin: 0.5rem 0;
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

  .run-error {
    margin: 0;
    padding: 0.5rem 1rem;
    background: #4a1c1c;
    color: #ffa198;
    font-size: 0.85rem;
    border-bottom: 1px solid #f85149;
  }
</style>
