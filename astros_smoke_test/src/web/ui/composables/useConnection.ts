import { onMounted, ref } from 'vue';
import * as api from '../api';
import type { CockpitState, SerialPortInfo } from '../api';

export function useConnection() {
  const state = ref<CockpitState | null>(null);
  const ports = ref<SerialPortInfo[]>([]);
  const error = ref<string | null>(null);
  const busy = ref(false);

  async function refreshState(): Promise<void> {
    error.value = null;
    try {
      state.value = await api.getState();
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err);
    }
  }

  async function refreshPorts(): Promise<void> {
    error.value = null;
    try {
      ports.value = await api.getPorts();
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err);
    }
  }

  async function connect(port: string, baud: number): Promise<void> {
    busy.value = true;
    error.value = null;
    try {
      state.value = await api.connect(port, baud);
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err);
    } finally {
      busy.value = false;
    }
  }

  async function disconnect(): Promise<void> {
    busy.value = true;
    error.value = null;
    try {
      await api.disconnect();
      await refreshState();
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err);
    } finally {
      busy.value = false;
    }
  }

  async function panic(): Promise<void> {
    error.value = null;
    try {
      await api.panic();
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err);
    }
  }

  onMounted(async () => {
    await Promise.all([refreshState(), refreshPorts()]);
  });

  return {
    state,
    ports,
    error,
    busy,
    connect,
    disconnect,
    panic,
    refreshState,
    refreshPorts,
  };
}
