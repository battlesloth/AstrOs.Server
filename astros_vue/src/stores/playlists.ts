import apiService from '@/api/apiService';
import { PLAYLISTS, PLAYLISTS_ALL, PLAYLISTS_COPY, SCRIPTS_ALL_NAMES } from '@/api/endpoints';
import { PlaylistType } from '@/enums/playlists/playlistType';
import type { Playlist } from '@/models/playlists/playlist';
import type { ScriptData } from '@/models/playlists/scriptData';
import { generateShortId } from '@/utils/shortId';
import { defineStore } from 'pinia';
import { ref } from 'vue';

export const usePlaylistsStore = defineStore('playlists', () => {
  const selectedPlaylist = ref<Playlist | null>(null);
  const playlists = ref<Playlist[]>([]);
  const scripts = ref<ScriptData[]>([]);
  const isLoading = ref(false);
  const isSaving = ref(false);

  async function createNewPlaylist() {
    isLoading.value = true;
    try {
      selectedPlaylist.value = {
        id: generateShortId('p'),
        playlistName: 'New Playlist',
        description: '',
        playlistType: PlaylistType.Sequential,
        tracks: [],
        settings: {
          randomDelay: false,
          delayMin: 0,
          delayMax: 0,
        },
      };
    } catch (error) {
      console.error('Failed to create new playlist:', error);
    } finally {
      isLoading.value = false;
    }
  }

  async function loadPlaylist(playlistId: string) {
    isLoading.value = true;
    try {
      const response = (await apiService.get(`${PLAYLISTS}/${playlistId}`)) as Playlist;
      selectedPlaylist.value = response;
      return { success: true };
    } catch (error) {
      console.error('Failed to load playlist:', error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    } finally {
      isLoading.value = false;
    }
  }

  async function loadData() {
    isLoading.value = true;
    try {
      const playlistResponse = (await apiService.get(PLAYLISTS_ALL)) as Playlist[];
      playlists.value = [...playlistResponse];
      const scriptResponse = (await apiService.get(SCRIPTS_ALL_NAMES)) as ScriptData[];
      scripts.value = [...scriptResponse];
      return { success: true };
    } catch (error) {
      console.error('Failed to load playlists:', error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    } finally {
      isLoading.value = false;
    }
  }

  async function saveSelectedPlaylist() {
    if (!selectedPlaylist.value) {
      return { success: false, error: 'No playlist selected' };
    }
    isSaving.value = true;
    try {
      await apiService.post(PLAYLISTS, selectedPlaylist.value);
      return { success: true };
    } catch (error) {
      console.error('Failed to save playlist:', error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    } finally {
      isSaving.value = false;
    }
  }

  async function copyPlaylist(playlistId: string) {
    try {
      const response = (await apiService.get(PLAYLISTS_COPY, { id: playlistId })) as Playlist;
      playlists.value.push(response);
      return { success: true, data: response };
    } catch (error) {
      console.error('Failed to copy playlist:', error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  async function deletePlaylist(playlistId: string) {
    try {
      await apiService.delete(PLAYLISTS, { id: playlistId });
      playlists.value = playlists.value.filter((p) => p.id !== playlistId);
      return { success: true };
    } catch (error) {
      console.error('Failed to delete playlist:', error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  return {
    playlists,
    scripts,
    isLoading,
    isSaving,
    createNewPlaylist,
    loadPlaylist,
    loadData,
    saveSelectedPlaylist,
    copyPlaylist,
    deletePlaylist,
  };
});
