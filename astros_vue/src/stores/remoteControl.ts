import apiService from '@/api/apiService';
import { REMOTE_CONFIG } from '@/api/endpoints';
import type { RemoteControlPage } from '@/models';
import type { PageButton, PageButtonType } from '@/models/remoteControl/pageButton';
import { defineStore } from 'pinia';
import { ref } from 'vue';

function defaultButton(name: string): PageButton {
  return { id: '0', name, type: 'none' };
}

function createDefaultPage(): RemoteControlPage {
  return {
    button1: defaultButton('Button 1'),
    button2: defaultButton('Button 2'),
    button3: defaultButton('Button 3'),
    button4: defaultButton('Button 4'),
    button5: defaultButton('Button 5'),
    button6: defaultButton('Button 6'),
    button7: defaultButton('Button 7'),
    button8: defaultButton('Button 8'),
    button9: defaultButton('Button 9'),
  };
}

function migrateButton(btn: PageButton): PageButton {
  if (btn.type) return btn;
  const type: PageButtonType = btn.id === '0' ? 'none' : 'script';
  return { ...btn, type };
}

function migratePage(page: RemoteControlPage): RemoteControlPage {
  const migrated = {} as RemoteControlPage;
  for (const key of Object.keys(page) as (keyof RemoteControlPage)[]) {
    migrated[key] = migrateButton(page[key]);
  }
  return migrated;
}

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
        remoteControlPages.value = result.map(migratePage);
      } else {
        remoteControlPages.value = [createDefaultPage()];
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
