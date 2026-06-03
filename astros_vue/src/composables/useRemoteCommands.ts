import apiService from '@/api/apiService';
import { PANIC_STOP, PANIC_CLEAR } from '@/api/endpoints';
import { useScriptsStore } from '@/stores/scripts';
import { usePlaylistsStore } from '@/stores/playlists';

// Discriminated union: a failure always carries a reason, so callers can do
// `if (!r.success) toast(r.error)` without a fallback. Normalizing the stores'
// looser `{ success: boolean; error?: string }` returns into this guarantees it.
export type CommandResult = { success: true } | { success: false; error: string };

function normalize(result: { success: boolean; error?: string }): CommandResult {
  return result.success
    ? { success: true }
    : { success: false, error: result.error ?? 'command failed' };
}

/**
 * Command sender for the live remote. Run-script / run-playlist reuse the
 * existing store actions; panicStop adds the (previously frontend-less) wire to
 * the backend POST /panicStop route. All calls resolve to a CommandResult and
 * never throw — but callers MUST surface a failure to the operator: the remote
 * grid shows an optimistic "sent" toast on press, so a swallowed failure would
 * leave the operator believing a command (or the e-stop) was delivered.
 */
export function useRemoteCommands() {
  const scripts = useScriptsStore();
  const playlists = usePlaylistsStore();

  async function runScript(id: string): Promise<CommandResult> {
    return normalize(await scripts.runScript(id));
  }

  async function runPlaylist(id: string): Promise<CommandResult> {
    return normalize(await playlists.runPlaylist(id));
  }

  async function panicStop(): Promise<CommandResult> {
    try {
      await apiService.post(PANIC_STOP, {});
      return { success: true };
    } catch (error) {
      console.error('Failed to send panic stop:', error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  async function panicClear(): Promise<CommandResult> {
    try {
      await apiService.post(PANIC_CLEAR, {});
      return { success: true };
    } catch (error) {
      console.error('Failed to clear panic stop:', error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  return { runScript, runPlaylist, panicStop, panicClear };
}
