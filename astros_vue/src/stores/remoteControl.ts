import apiService from '@/api/apiService';
import { REMOTE_CONFIG } from '@/api/endpoints';
import type { RemoteControlPage } from '@/models';
import { BUTTON_KEYS } from '@/models/remoteControl/remoteControlPage';
import type { PageButton, PageButtonType } from '@/models/remoteControl/pageButton';
import { defineStore } from 'pinia';
import { ref } from 'vue';

function defaultButton(name: string): PageButton {
  return { id: '0', name, type: 'none' };
}

function defaultPageName(idx: number): string {
  return `Page ${idx + 1}`;
}

export function createDefaultPage(idx: number): RemoteControlPage {
  return {
    id: crypto.randomUUID(),
    name: defaultPageName(idx),
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

function isPageButtonShape(raw: unknown): raw is PageButton {
  // Migration is the only entry point for legacy stored payloads; anything that
  // isn't an object with an `id` string gets replaced with a default button rather
  // than spread into the result (a string spread would produce {0:'a',1:'b',...}).
  return typeof raw === 'object' && raw !== null && typeof (raw as PageButton).id === 'string';
}

export function migratePage(page: Partial<RemoteControlPage>, idx: number): RemoteControlPage {
  const migrated = {
    id: page.id ?? crypto.randomUUID(),
    name: page.name ?? defaultPageName(idx),
  } as RemoteControlPage;
  for (const key of BUTTON_KEYS) {
    const raw = page[key];
    migrated[key] = isPageButtonShape(raw) ? migrateButton(raw) : defaultButton('None');
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

      const result = JSON.parse(response) as Partial<RemoteControlPage>[];

      if (!Array.isArray(result)) {
        throw new Error('No remote control configuration found');
      }

      if (result.length > 0) {
        remoteControlPages.value = result.map((page, idx) => migratePage(page, idx));
      } else {
        remoteControlPages.value = [createDefaultPage(0)];
      }
      return { success: true, data: result };
    } catch (error) {
      console.error('Failed to load remote control configuration:', error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  async function saveRemoteControl() {
    const contentPages = remoteControlPages.value.filter((page) =>
      BUTTON_KEYS.some((key) => page[key].id !== '0'),
    );

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
