<script setup lang="ts">
import { onMounted, ref } from 'vue';

interface CockpitState {
  connected: boolean;
  port: string | null;
  baud: number | null;
  activeRunId: string | null;
}

const state = ref<CockpitState | null>(null);
const error = ref<string | null>(null);

onMounted(async () => {
  try {
    const res = await fetch('/api/state');
    state.value = await res.json();
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  }
});
</script>

<template>
  <main>
    <h1>AstrOs Smoke Test Cockpit</h1>
    <p class="muted">Phase 2 scaffold — placeholder</p>

    <section>
      <h2>Server state</h2>
      <pre v-if="state">{{ JSON.stringify(state, null, 2) }}</pre>
      <p
        v-else-if="error"
        class="error"
      >
        Failed to fetch /api/state: {{ error }}
      </p>
      <p
        v-else
        class="muted"
      >
        Loading...
      </p>
    </section>
  </main>
</template>

<style>
  body {
    margin: 0;
    padding: 2rem;
    font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
    background: #0d1117;
    color: #e6edf3;
    line-height: 1.5;
  }

  main {
    max-width: 720px;
    margin: 0 auto;
  }

  h1 {
    color: #58a6ff;
    margin-top: 0;
  }

  h2 {
    color: #7ee787;
    font-size: 1rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .muted {
    color: #8b949e;
  }

  .error {
    color: #f85149;
  }

  pre {
    background: #161b22;
    border: 1px solid #30363d;
    border-radius: 6px;
    padding: 1rem;
    overflow-x: auto;
  }
</style>
