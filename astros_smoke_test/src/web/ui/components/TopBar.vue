<script setup lang="ts">
import { computed, inject, ref, watch } from 'vue';
import { ConnectionKey } from '../composables/useConnection';

// Inject the connection context provided by App.vue. The throw guards an
// app-tree invariant: TopBar must mount under a provider; failure is a
// developer error, not a runtime condition users would ever hit.
const connection = inject(ConnectionKey);
if (!connection) {
  throw new Error('TopBar requires a ConnectionKey provider (mount inside App.vue).');
}
const { state, ports, error, busy, connect, disconnect, panic, refreshPorts } = connection;

const selectedPort = ref<string>('');
const baud = ref<number>(115200);

watch(
  ports,
  (list) => {
    if (!selectedPort.value && list.length > 0) {
      selectedPort.value = list[0].path;
    }
  },
  { immediate: true },
);

// No events watcher here — App.vue already calls refreshState() on
// connection-shape events, and `state` is now the shared ref so the pill
// updates automatically.

const statusPill = computed(() => {
  if (!state.value) return { text: 'loading...', tone: 'gray' };
  if (state.value.connected) {
    const padawan = state.value.padawan;
    const padawanText = padawan ? `  ·  padawan ${padawan.address}` : '';
    return {
      text: `connected to ${state.value.port} @ ${state.value.baud}${padawanText}`,
      tone: 'green',
    };
  }
  return { text: 'disconnected', tone: 'gray' };
});

const isConnected = computed(() => state.value?.connected === true);
</script>

<template>
  <header class="topbar">
    <div class="row">
      <select
        v-model="selectedPort"
        :disabled="isConnected || busy"
        @focus="refreshPorts"
      >
        <option
          v-if="ports.length === 0"
          disabled
          value=""
        >
          no ports detected
        </option>
        <option
          v-for="p in ports"
          :key="p.path"
          :value="p.path"
        >
          {{ p.path }}
        </option>
      </select>

      <input
        v-model.number="baud"
        type="number"
        :disabled="isConnected || busy"
      />

      <button
        v-if="!isConnected"
        :disabled="!selectedPort || busy"
        @click="connect(selectedPort, baud)"
      >
        Connect
      </button>
      <button
        v-else
        :disabled="busy"
        @click="disconnect()"
      >
        Disconnect
      </button>

      <span
        class="pill"
        :data-tone="statusPill.tone"
        >{{ statusPill.text }}</span
      >
    </div>

    <button
      class="panic"
      :disabled="!isConnected"
      @click="panic()"
    >
      PANIC
    </button>
  </header>

  <p
    v-if="error"
    class="error"
    role="alert"
  >
    {{ error }}
  </p>
</template>

<style scoped>
  .topbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.6rem 1rem;
    background: #161b22;
    border-bottom: 1px solid #30363d;
  }

  .row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex: 1;
    min-width: 0;
  }

  select,
  input,
  button {
    font: inherit;
    font-size: 0.9rem;
    padding: 0.4rem 0.6rem;
    background: #0d1117;
    color: #e6edf3;
    border: 1px solid #30363d;
    border-radius: 4px;
  }

  input[type='number'] {
    width: 8ch;
  }

  button {
    cursor: pointer;
  }
  button:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .pill {
    margin-left: auto;
    font-size: 0.85rem;
    padding: 0.25rem 0.7rem;
    border-radius: 999px;
    white-space: nowrap;
  }
  .pill[data-tone='green'] {
    background: #238636;
    color: #fff;
  }
  .pill[data-tone='gray'] {
    background: #30363d;
    color: #8b949e;
  }

  .panic {
    background: #f85149;
    color: #fff;
    font-weight: 700;
    border: none;
    padding: 0.5rem 1rem;
  }
  .panic:hover:not(:disabled) {
    background: #da3633;
  }

  .error {
    margin: 0;
    padding: 0.5rem 1rem;
    background: #4a1c1c;
    color: #ffa198;
    font-size: 0.9rem;
    border-bottom: 1px solid #f85149;
  }
</style>
