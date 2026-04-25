<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import * as api from '../api';
import type { ScenarioInfo } from '../api';

const props = defineProps<{
  connected: boolean;
  activeRunId: string | null;
}>();

const emit = defineEmits<{
  (e: 'run', scenario: ScenarioInfo): void;
}>();

const scenarios = ref<ScenarioInfo[]>([]);
const error = ref<string | null>(null);

onMounted(async () => {
  try {
    scenarios.value = await api.getScenarios();
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  }
});

const runEnabled = computed(() => props.connected && props.activeRunId === null);

function clickRun(scenario: ScenarioInfo): void {
  if (!runEnabled.value) return;
  emit('run', scenario);
}
</script>

<template>
  <aside class="scenarios">
    <h2>Scenarios</h2>
    <p
      v-if="error"
      class="error"
      role="alert"
    >
      {{ error }}
    </p>
    <ul v-else>
      <li
        v-for="s in scenarios"
        :key="s.id"
      >
        <button
          class="scenario"
          :disabled="!runEnabled"
          :class="{ destructive: s.severity === 'destructive', caution: s.severity === 'caution' }"
          :title="s.description"
          @click="clickRun(s)"
        >
          <span class="name">{{ s.id }}</span>
          <span
            v-if="s.severity === 'destructive'"
            class="badge badge-destructive"
            >destructive</span
          >
          <span
            v-else-if="s.severity === 'caution'"
            class="badge badge-caution"
            >caution</span
          >
          <span class="desc">{{ s.description }}</span>
        </button>
      </li>
    </ul>
    <p
      v-if="!connected"
      class="muted hint"
    >
      Connect to a serial port to enable scenarios.
    </p>
    <p
      v-else-if="activeRunId !== null"
      class="muted hint"
    >
      A run is in progress…
    </p>
  </aside>
</template>

<style scoped>
  .scenarios {
    padding: 1rem;
    border-right: 1px solid #30363d;
    height: 100%;
    overflow-y: auto;
  }
  h2 {
    margin: 0 0 0.75rem;
    font-size: 0.85rem;
    color: #7ee787;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  ul {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }
  .scenario {
    width: 100%;
    text-align: left;
    background: #0d1117;
    color: #e6edf3;
    border: 1px solid #30363d;
    border-radius: 6px;
    padding: 0.6rem 0.75rem;
    font: inherit;
    font-size: 0.85rem;
    cursor: pointer;
    display: grid;
    grid-template-columns: 1fr auto;
    grid-template-rows: auto auto;
    grid-template-areas:
      'name badge'
      'desc desc';
    gap: 0.15rem 0.5rem;
  }
  .scenario:hover:not(:disabled) {
    border-color: #58a6ff;
    background: #161b22;
  }
  .scenario:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
  .name {
    grid-area: name;
    font-weight: 600;
    color: #58a6ff;
  }
  .badge {
    grid-area: badge;
    font-size: 0.65rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    padding: 0.1rem 0.4rem;
    border-radius: 4px;
    align-self: center;
  }
  .badge-destructive {
    background: #4a1c1c;
    color: #f85149;
  }
  .badge-caution {
    background: #3a2a08;
    color: #d29922;
  }
  .scenario.destructive .name {
    color: #f0883e;
  }
  .scenario.caution .name {
    color: #d29922;
  }
  .desc {
    grid-area: desc;
    font-size: 0.75rem;
    color: #8b949e;
    white-space: normal;
  }
  .hint {
    font-size: 0.75rem;
    margin-top: 0.75rem;
  }
  .muted {
    color: #8b949e;
  }
  .error {
    background: #4a1c1c;
    color: #ffa198;
    padding: 0.5rem;
    border-radius: 4px;
    font-size: 0.85rem;
  }
</style>
