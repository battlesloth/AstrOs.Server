import apiService from '@/api/apiService';
import { REMOTE_CONFIG } from '@/api/endpoints';
import type { RemoteControlPage } from '@/models/remoteControl/remoteControlPage';
import { defineStore } from 'pinia';
import { ref } from 'vue';

export const useRemoteControlStore = defineStore('remoteControl', () => {
  const remoteControlPages = ref<RemoteControlPage[]>([]);
  const isLoading = ref(false);

  async function loadRemoteControl() {
    isLoading.value = true;
    try {
      const response = (await apiService.get(REMOTE_CONFIG)) as string;

      const result = JSON.parse(response) as RemoteControlPage[];

      if (!Array.isArray(result)) {
        throw new Error('No remote control configuration found');
      }

      if (result.length > 0) {
        remoteControlPages.value = [...result];
      } else {
        remoteControlPages.value = [
          {
            button1: { id: '0', name: 'Button 1' },
            button2: { id: '0', name: 'Button 2' },
            button3: { id: '0', name: 'Button 3' },
            button4: { id: '0', name: 'Button 4' },
            button5: { id: '0', name: 'Button 5' },
            button6: { id: '0', name: 'Button 6' },
            button7: { id: '0', name: 'Button 7' },
            button8: { id: '0', name: 'Button 8' },
            button9: { id: '0', name: 'Button 9' },
          },
        ];
      }
      return { success: true, data: result };
    } catch (error) {
      console.error('Failed to load remote control configuration:', error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  async function saveRemoteControl() {
    const contentPages = remoteControlPages.value.filter((page) => {
      return Object.values(page).some((button) => button.id !== '0');
    });

    const payload = JSON.stringify(contentPages);

    try {
      await apiService.put(REMOTE_CONFIG, { config: payload });
      return { success: true };
    } catch (error) {
      console.error('Failed to save remote control configuration:', error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  return {
    remoteControlPages,
    isLoading,
    loadRemoteControl,
    saveRemoteControl,
  };
});
