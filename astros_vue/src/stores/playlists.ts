import apiService from '@/api/apiService';
import { PLAYLISTS, PLAYLISTS_ALL, PLAYLISTS_COPY, SCRIPTS_ALL_NAMES } from '@/api/endpoints';
import type { Playlist } from '@/models/playlists/playlist';
import type { ScriptData } from '@/models/playlists/scriptData';
import { defineStore } from 'pinia';
import { ref } from 'vue';

export const usePlaylistsStore = defineStore('playlists', () => {
  const playlists = ref<Playlist[]>([]);
  const scripts = ref<ScriptData[]>([]);
  const isLoading = ref(false);
  const isSaving = ref(false);

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

  async function savePlaylist(playlist: Playlist) {
    isSaving.value = true;
    try {
      await apiService.post(PLAYLISTS, playlist);
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
    loadData,
    savePlaylist,
    copyPlaylist,
    deletePlaylist,
  };
});
