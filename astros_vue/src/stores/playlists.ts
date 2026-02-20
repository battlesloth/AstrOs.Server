import apiService from '@/api/apiService';
import { PLAYLISTS, PLAYLISTS_ALL, PLAYLISTS_COPY } from '@/api/endpoints';
import type { Playlist } from '@/models/playlists/playlist';
import { defineStore } from 'pinia';
import { ref } from 'vue';

export const usePlaylistsStore = defineStore('playlists', () => {
  const playlists = ref<Playlist[]>([]);
  const isLoading = ref(false);
  const isSaving = ref(false);

  async function loadPlaylists() {
    isLoading.value = true;
    try {
      const response = (await apiService.get(PLAYLISTS_ALL)) as Playlist[];
      playlists.value = [...response];
      return { success: true, data: response };
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
    isLoading,
    isSaving,
    loadPlaylists,
    savePlaylist,
    copyPlaylist,
    deletePlaylist,
  };
});
