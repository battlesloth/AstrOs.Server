import apiService from '@/api/apiService';
import { PANIC_STOP } from '@/api/endpoints';
import { useScriptsStore } from '@/stores/scripts';
import { usePlaylistsStore } from '@/stores/playlists';

type CommandResult = { success: boolean; error?: string };

/**
 * Command sender for the live remote. Run-script / run-playlist reuse the
 * existing store actions; panicStop adds the (previously frontend-less) wire to
 * the backend POST /panicStop route. All calls are fire-and-forget from the
 * caller's perspective — they resolve to a {success} result and never throw.
 */
export function useRemoteCommands() {
  const scripts = useScriptsStore();
  const playlists = usePlaylistsStore();

  function runScript(id: string): Promise<CommandResult> {
    return scripts.runScript(id);
  }

  function runPlaylist(id: string): Promise<CommandResult> {
    return playlists.runPlaylist(id);
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

  return { runScript, runPlaylist, panicStop };
}
