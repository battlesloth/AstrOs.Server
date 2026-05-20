import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

vi.mock('@/api/apiService', () => ({
  default: {
    get: vi.fn(),
    put: vi.fn(),
  },
}));

import apiService from '@/api/apiService';
import { useRemoteControlStore, migratePage, createDefaultPage } from '../remoteControl';
import { BUTTON_KEYS } from '@/models/remoteControl/remoteControlPage';
import type { RemoteControlPage } from '@/models/remoteControl/remoteControlPage';

const apiGet = apiService.get as ReturnType<typeof vi.fn>;
const apiPut = apiService.put as ReturnType<typeof vi.fn>;

// Loose stand-in for a UUID — we only care that crypto.randomUUID() ran,
// not that the value matches RFC 4122. Asserting a real UUID shape would
// couple the test to crypto.randomUUID's format and add nothing.
const UUID_LIKE = /^[0-9a-f-]{8,}$/i;

function legacyPage(): Record<string, { id: string; name: string }> {
  // No id, no name, no `type` on the buttons — the "stored before Phase 1" shape.
  return {
    button1: { id: '0', name: 'None' },
    button2: { id: '0', name: 'None' },
    button3: { id: '0', name: 'None' },
    button4: { id: '0', name: 'None' },
    button5: { id: '0', name: 'None' },
    button6: { id: '0', name: 'None' },
    button7: { id: '0', name: 'None' },
    button8: { id: '0', name: 'None' },
    button9: { id: '0', name: 'None' },
  };
}

describe('remoteControl store', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    apiGet.mockReset();
    apiPut.mockReset();
  });

  describe('migratePage', () => {
    it('backfills a UUID-shaped id when missing', () => {
      const migrated = migratePage(legacyPage() as Partial<RemoteControlPage>, 0);
      expect(migrated.id).toMatch(UUID_LIKE);
    });

    it('backfills name as "Page N" when missing (1-indexed)', () => {
      expect(migratePage(legacyPage() as Partial<RemoteControlPage>, 0).name).toBe('Page 1');
      expect(migratePage(legacyPage() as Partial<RemoteControlPage>, 2).name).toBe('Page 3');
    });

    it('preserves an existing id (no overwrite)', () => {
      const input = {
        ...legacyPage(),
        id: 'existing-id-12345',
      } as unknown as Partial<RemoteControlPage>;
      expect(migratePage(input, 0).id).toBe('existing-id-12345');
    });

    it('preserves an existing name (no overwrite)', () => {
      const input = {
        ...legacyPage(),
        name: 'My Custom Page',
      } as unknown as Partial<RemoteControlPage>;
      expect(migratePage(input, 0).name).toBe('My Custom Page');
    });

    it('runs migrateButton on each of the 9 button slots (adds `type` field)', () => {
      const migrated = migratePage(legacyPage() as Partial<RemoteControlPage>, 0);
      for (const key of BUTTON_KEYS) {
        expect(migrated[key].type).toBe('none');
      }
    });

    it('replaces malformed button slots with default buttons (object without id, empty object, primitive)', () => {
      // Manually-edited or corrupt stored payloads might have button slots that
      // are not the expected { id, name } shape. Migration is the boundary
      // enforcement point — anything not matching the shape becomes a default
      // button rather than getting spread (a string spread would produce
      // {0:'a',1:'b',...}).
      const malformed = {
        ...legacyPage(),
        button2: {} as unknown as { id: string; name: string },
        button3: 'oops' as unknown as { id: string; name: string },
        button4: { name: 'NoIdField' } as unknown as { id: string; name: string },
      };
      const migrated = migratePage(malformed as Partial<RemoteControlPage>, 0);
      expect(migrated.button2).toEqual({ id: '0', name: 'None', type: 'none' });
      expect(migrated.button3).toEqual({ id: '0', name: 'None', type: 'none' });
      expect(migrated.button4).toEqual({ id: '0', name: 'None', type: 'none' });
      // Sibling slots that were valid stay intact.
      expect(migrated.button1.id).toBe('0');
      expect(migrated.button1.type).toBe('none');
    });
  });

  describe('createDefaultPage', () => {
    it('produces a page with id, name, and 9 buttons', () => {
      const page = createDefaultPage(0);
      expect(page.id).toMatch(UUID_LIKE);
      expect(page.name).toBe('Page 1');
      for (const key of BUTTON_KEYS) {
        expect(page[key].id).toBe('0');
        expect(page[key].type).toBe('none');
      }
    });

    it('names by 1-indexed position', () => {
      expect(createDefaultPage(4).name).toBe('Page 5');
    });
  });

  describe('loadRemoteControl', () => {
    it('seeds one default page when the stored config is empty', async () => {
      apiGet.mockResolvedValue(JSON.stringify([]));
      const store = useRemoteControlStore();

      await store.loadRemoteControl();

      expect(store.remoteControlPages).toHaveLength(1);
      expect(store.remoteControlPages[0]!.id).toMatch(UUID_LIKE);
      expect(store.remoteControlPages[0]!.name).toBe('Page 1');
    });

    it('migrates legacy stored pages so each has an id and name', async () => {
      apiGet.mockResolvedValue(JSON.stringify([legacyPage(), legacyPage()]));
      const store = useRemoteControlStore();

      await store.loadRemoteControl();

      expect(store.remoteControlPages).toHaveLength(2);
      expect(store.remoteControlPages[0]!.id).toMatch(UUID_LIKE);
      expect(store.remoteControlPages[0]!.name).toBe('Page 1');
      expect(store.remoteControlPages[1]!.id).toMatch(UUID_LIKE);
      expect(store.remoteControlPages[1]!.name).toBe('Page 2');
    });

    it('keeps existing id/name when the stored config already has them', async () => {
      const stored = [
        { ...legacyPage(), id: 'persistent-id-A', name: 'Quick Actions' },
        { ...legacyPage(), id: 'persistent-id-B', name: 'Songs' },
      ];
      apiGet.mockResolvedValue(JSON.stringify(stored));
      const store = useRemoteControlStore();

      await store.loadRemoteControl();

      expect(store.remoteControlPages[0]!.id).toBe('persistent-id-A');
      expect(store.remoteControlPages[0]!.name).toBe('Quick Actions');
      expect(store.remoteControlPages[1]!.id).toBe('persistent-id-B');
      expect(store.remoteControlPages[1]!.name).toBe('Songs');
    });
  });

  describe('saveRemoteControl', () => {
    it('retains a page that has at least one non-default button', async () => {
      apiGet.mockResolvedValue(JSON.stringify([]));
      apiPut.mockResolvedValue(undefined);
      const store = useRemoteControlStore();
      await store.loadRemoteControl();

      // Mutate the seeded default page so button1 is wired up.
      store.remoteControlPages[0]!.button1 = {
        id: 'script-id-7',
        name: 'Wave',
        type: 'script',
      };

      await store.saveRemoteControl();

      expect(apiPut).toHaveBeenCalledTimes(1);
      const sent = apiPut.mock.calls[0]![1] as { config: string };
      const parsed = JSON.parse(sent.config) as RemoteControlPage[];
      expect(parsed).toHaveLength(1);
    });

    it('drops a page where all 9 buttons are id="0" — even when the page id/name are populated strings (vacuous-fix guard for Object.values reflection bug)', async () => {
      apiGet.mockResolvedValue(JSON.stringify([]));
      apiPut.mockResolvedValue(undefined);
      const store = useRemoteControlStore();
      await store.loadRemoteControl();

      // The seeded default page already has a populated UUID id and a "Page 1" name
      // but all buttons are id="0". The OLD filter (`Object.values(page).some(b => b.id !== '0')`)
      // would treat page.id (the UUID string) as a button and short-circuit true on
      // `someUuid.id !== '0'` (which is `undefined !== '0'` = true), retaining the page.
      // The fixed filter iterates BUTTON_KEYS only, so this all-empty page is dropped.
      expect(store.remoteControlPages).toHaveLength(1);
      expect(store.remoteControlPages[0]!.id).toMatch(UUID_LIKE);
      expect(store.remoteControlPages[0]!.name).toBe('Page 1');

      await store.saveRemoteControl();

      const sent = apiPut.mock.calls[0]![1] as { config: string };
      const parsed = JSON.parse(sent.config) as RemoteControlPage[];
      expect(parsed).toHaveLength(0);
    });
  });
});
