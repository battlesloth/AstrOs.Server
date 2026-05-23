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

    it('replaces malformed button slots with default buttons', () => {
      // Manually-edited or corrupt stored payloads might have button slots that
      // are not the expected { id, name } shape. Migration is the boundary
      // enforcement point — anything not matching the shape becomes a default
      // button rather than getting spread (a string spread would produce
      // {0:'a',1:'b',...}, and a no-`name` slot would surface `undefined` to
      // remote consumers on sync — dropped by JSON.stringify on the wire,
      // breaking the {name, command} contract).
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const malformed = {
        ...legacyPage(),
        button2: {} as unknown as { id: string; name: string },
        button3: 'oops' as unknown as { id: string; name: string },
        button4: { name: 'NoIdField' } as unknown as { id: string; name: string },
        button5: { id: 'script-x' } as unknown as { id: string; name: string },
      };
      const migrated = migratePage(malformed as Partial<RemoteControlPage>, 0);
      expect(migrated.button2).toEqual({ id: '0', name: 'None', type: 'none' });
      expect(migrated.button3).toEqual({ id: '0', name: 'None', type: 'none' });
      expect(migrated.button4).toEqual({ id: '0', name: 'None', type: 'none' });
      expect(migrated.button5).toEqual({ id: '0', name: 'None', type: 'none' });
      expect(migrated.button1.id).toBe('0');
      expect(migrated.button1.type).toBe('none');
      expect(warnSpy).toHaveBeenCalled();
      warnSpy.mockRestore();
    });
  });

  describe('BUTTON_KEYS contract', () => {
    // Pinning the literal here protects against silent mutation: if production
    // code shrinks BUTTON_KEYS to 8 entries, the migration loop would still
    // run, the assertions in other tests (which themselves iterate BUTTON_KEYS)
    // would pass on a mutated set, and the bug would slip through. This is the
    // anchor.
    it('contains exactly button1..button9 in order', () => {
      expect([...BUTTON_KEYS]).toEqual([
        'button1',
        'button2',
        'button3',
        'button4',
        'button5',
        'button6',
        'button7',
        'button8',
        'button9',
      ]);
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

    it('assigns distinct ids to each migrated page', async () => {
      apiGet.mockResolvedValue(JSON.stringify([legacyPage(), legacyPage(), legacyPage()]));
      const store = useRemoteControlStore();

      await store.loadRemoteControl();

      const ids = store.remoteControlPages.map((p) => p.id);
      expect(new Set(ids).size).toBe(3);
    });

    it('returns {success:false} and leaves pages untouched when the stored config is not an array', async () => {
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      apiGet.mockResolvedValue(JSON.stringify({ corrupt: true }));
      const store = useRemoteControlStore();

      const result = await store.loadRemoteControl();

      expect(result.success).toBe(false);
      expect(store.remoteControlPages).toEqual([]);
      errSpy.mockRestore();
    });

    it('returns {success:false, error} when the API rejects', async () => {
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      apiGet.mockRejectedValue(new Error('network down'));
      const store = useRemoteControlStore();

      const result = await store.loadRemoteControl();

      expect(result.success).toBe(false);
      expect(result.error).toBe('network down');
      errSpy.mockRestore();
    });
  });

  describe('saveRemoteControl', () => {
    it('retains a page that has at least one non-default button', async () => {
      apiGet.mockResolvedValue(JSON.stringify([]));
      apiPut.mockResolvedValue(undefined);
      const store = useRemoteControlStore();
      await store.loadRemoteControl();

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

    it('serializes id and name on retained pages so they round-trip through storage', async () => {
      apiGet.mockResolvedValue(JSON.stringify([]));
      apiPut.mockResolvedValue(undefined);
      const store = useRemoteControlStore();
      await store.loadRemoteControl();

      const seededId = store.remoteControlPages[0]!.id;
      store.remoteControlPages[0]!.name = 'Quick Actions';
      store.remoteControlPages[0]!.button1 = { id: 'script-1', name: 'Wave', type: 'script' };

      await store.saveRemoteControl();

      const sent = apiPut.mock.calls[0]![1] as { config: string };
      const parsed = JSON.parse(sent.config) as RemoteControlPage[];
      expect(parsed[0]!.id).toBe(seededId);
      expect(parsed[0]!.name).toBe('Quick Actions');
    });

    it('drops a page where all 9 buttons are id="0" even when page id/name are populated strings', async () => {
      apiGet.mockResolvedValue(JSON.stringify([]));
      apiPut.mockResolvedValue(undefined);
      const store = useRemoteControlStore();
      await store.loadRemoteControl();

      // Guards against regressing the BUTTON_KEYS filter to a reflection-style
      // `Object.values(page).some(b => b.id !== '0')`. The seeded page has a
      // populated UUID id and "Page 1" name; the old form would short-circuit
      // true on `someUuid.id !== '0'` (undefined !== '0' is true) and retain
      // the page. The fixed form iterates BUTTON_KEYS only and drops it.
      // Verified mechanically: reverting the filter to Object.values makes
      // this test fail (parsed.length === 1).
      expect(store.remoteControlPages).toHaveLength(1);
      expect(store.remoteControlPages[0]!.id).toMatch(UUID_LIKE);
      expect(store.remoteControlPages[0]!.name).toBe('Page 1');

      await store.saveRemoteControl();

      const sent = apiPut.mock.calls[0]![1] as { config: string };
      const parsed = JSON.parse(sent.config) as RemoteControlPage[];
      expect(parsed).toHaveLength(0);
    });

    it('returns {success:false, error} when the API rejects', async () => {
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      apiGet.mockResolvedValue(JSON.stringify([]));
      apiPut.mockRejectedValue(new Error('save failed'));
      const store = useRemoteControlStore();
      await store.loadRemoteControl();
      store.remoteControlPages[0]!.button1 = { id: 'script-1', name: 'Wave', type: 'script' };

      const result = await store.saveRemoteControl();

      expect(result.success).toBe(false);
      expect(result.error).toBe('save failed');
      errSpy.mockRestore();
    });
  });

  describe('isDirty flag', () => {
    it('starts false on a fresh store', () => {
      const store = useRemoteControlStore();
      expect(store.isDirty).toBe(false);
    });

    it('stays false after a successful load', async () => {
      apiGet.mockResolvedValue(JSON.stringify([]));
      const store = useRemoteControlStore();
      await store.loadRemoteControl();
      expect(store.isDirty).toBe(false);
    });

    it('clears to false when a successful load follows a dirty state', async () => {
      apiGet.mockResolvedValue(JSON.stringify([]));
      const store = useRemoteControlStore();
      // Poke directly because the mutation methods that flip the flag land
      // in later tasks; this isolates "load clears it" behavior.
      (store as unknown as { isDirty: boolean }).isDirty = true;
      await store.loadRemoteControl();
      expect(store.isDirty).toBe(false);
    });

    it('does NOT clear isDirty when load fails (network)', async () => {
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      apiGet.mockRejectedValue(new Error('network down'));
      const store = useRemoteControlStore();
      (store as unknown as { isDirty: boolean }).isDirty = true;
      await store.loadRemoteControl();
      expect(store.isDirty).toBe(true);
      errSpy.mockRestore();
    });
  });

  describe('selectedIdx + selectPage', () => {
    it('starts at 0', () => {
      const store = useRemoteControlStore();
      expect(store.selectedIdx).toBe(0);
    });

    it('selectPage(2) sets selectedIdx to 2 when 3 pages exist', async () => {
      apiGet.mockResolvedValue(JSON.stringify([legacyPage(), legacyPage(), legacyPage()]));
      const store = useRemoteControlStore();
      await store.loadRemoteControl();

      store.selectPage(2);

      expect(store.selectedIdx).toBe(2);
    });

    it('clamps selectPage(99) to last index when out of range high', async () => {
      apiGet.mockResolvedValue(JSON.stringify([legacyPage(), legacyPage()]));
      const store = useRemoteControlStore();
      await store.loadRemoteControl();

      store.selectPage(99);

      expect(store.selectedIdx).toBe(1);
    });

    it('clamps selectPage(-3) to 0 when negative', async () => {
      apiGet.mockResolvedValue(JSON.stringify([legacyPage(), legacyPage()]));
      const store = useRemoteControlStore();
      await store.loadRemoteControl();

      store.selectPage(-3);

      expect(store.selectedIdx).toBe(0);
    });

    it('does NOT set isDirty', async () => {
      apiGet.mockResolvedValue(JSON.stringify([legacyPage(), legacyPage()]));
      const store = useRemoteControlStore();
      await store.loadRemoteControl();

      store.selectPage(1);

      expect(store.isDirty).toBe(false);
    });

    it('loadRemoteControl resets selectedIdx to 0', async () => {
      apiGet.mockResolvedValue(JSON.stringify([legacyPage(), legacyPage(), legacyPage()]));
      const store = useRemoteControlStore();
      await store.loadRemoteControl();
      store.selectPage(2);

      apiGet.mockResolvedValue(JSON.stringify([legacyPage()]));
      await store.loadRemoteControl();

      expect(store.selectedIdx).toBe(0);
    });
  });

  describe('addPage', () => {
    it('appends a default page with auto-numbered name', async () => {
      apiGet.mockResolvedValue(JSON.stringify([legacyPage()]));
      const store = useRemoteControlStore();
      await store.loadRemoteControl();

      store.addPage();

      expect(store.remoteControlPages).toHaveLength(2);
      expect(store.remoteControlPages[1]!.name).toBe('Page 2');
      expect(store.remoteControlPages[1]!.id).toMatch(UUID_LIKE);
    });

    it('selects the newly added page', async () => {
      apiGet.mockResolvedValue(JSON.stringify([legacyPage()]));
      const store = useRemoteControlStore();
      await store.loadRemoteControl();

      store.addPage();

      expect(store.selectedIdx).toBe(1);
    });

    it('flips isDirty to true', async () => {
      apiGet.mockResolvedValue(JSON.stringify([legacyPage()]));
      const store = useRemoteControlStore();
      await store.loadRemoteControl();
      expect(store.isDirty).toBe(false);

      store.addPage();

      expect(store.isDirty).toBe(true);
    });
  });

  describe('duplicatePage', () => {
    it('splices a copy right after the source index with a fresh id', async () => {
      apiGet.mockResolvedValue(JSON.stringify([legacyPage(), legacyPage()]));
      const store = useRemoteControlStore();
      await store.loadRemoteControl();
      const srcId = store.remoteControlPages[0]!.id;

      store.duplicatePage(0);

      expect(store.remoteControlPages).toHaveLength(3);
      expect(store.remoteControlPages[1]!.id).not.toBe(srcId);
      expect(store.remoteControlPages[1]!.id).toMatch(UUID_LIKE);
    });

    it('names the copy "<src> (copy)"', async () => {
      apiGet.mockResolvedValue(JSON.stringify([{ ...legacyPage(), name: 'Performance' }]));
      const store = useRemoteControlStore();
      await store.loadRemoteControl();

      store.duplicatePage(0);

      expect(store.remoteControlPages[1]!.name).toBe('Performance (copy)');
    });

    it('deep-copies button slots (mutating source button in place does not affect copy)', async () => {
      // Slot reassignment (`page.button1 = {...}`) would always isolate the copy
      // even without a deep copy — it just rebinds the source's slot reference.
      // The real shared-reference hazard is in-place property mutation, which
      // is what a Pinia consumer would do via `page.button1.name = '...'` or
      // `page.button1.id = '...'`. This test pokes that path.
      apiGet.mockResolvedValue(JSON.stringify([legacyPage()]));
      const store = useRemoteControlStore();
      await store.loadRemoteControl();
      store.remoteControlPages[0]!.button1 = { id: 's1', name: 'Wave', type: 'script' };

      store.duplicatePage(0);
      store.remoteControlPages[0]!.button1.name = 'Bow';
      store.remoteControlPages[0]!.button1.id = 's2';

      expect(store.remoteControlPages[1]!.button1).toEqual({
        id: 's1',
        name: 'Wave',
        type: 'script',
      });
    });

    it('selects the copy', async () => {
      apiGet.mockResolvedValue(JSON.stringify([legacyPage(), legacyPage()]));
      const store = useRemoteControlStore();
      await store.loadRemoteControl();

      store.duplicatePage(0);

      expect(store.selectedIdx).toBe(1);
    });

    it('flips isDirty to true', async () => {
      apiGet.mockResolvedValue(JSON.stringify([legacyPage()]));
      const store = useRemoteControlStore();
      await store.loadRemoteControl();

      store.duplicatePage(0);

      expect(store.isDirty).toBe(true);
    });

    it('no-ops on out-of-range index (negative or beyond end)', async () => {
      apiGet.mockResolvedValue(JSON.stringify([legacyPage()]));
      const store = useRemoteControlStore();
      await store.loadRemoteControl();

      store.duplicatePage(-1);
      store.duplicatePage(99);

      expect(store.remoteControlPages).toHaveLength(1);
      expect(store.isDirty).toBe(false);
    });
  });

  describe('deletePage', () => {
    it('removes the page at the given index', async () => {
      apiGet.mockResolvedValue(
        JSON.stringify([
          { ...legacyPage(), name: 'A' },
          { ...legacyPage(), name: 'B' },
          { ...legacyPage(), name: 'C' },
        ]),
      );
      const store = useRemoteControlStore();
      await store.loadRemoteControl();

      store.deletePage(1);

      expect(store.remoteControlPages).toHaveLength(2);
      expect(store.remoteControlPages.map((p) => p.name)).toEqual(['A', 'C']);
    });

    it('no-ops when only one page remains', async () => {
      apiGet.mockResolvedValue(JSON.stringify([legacyPage()]));
      const store = useRemoteControlStore();
      await store.loadRemoteControl();

      store.deletePage(0);

      expect(store.remoteControlPages).toHaveLength(1);
      expect(store.isDirty).toBe(false);
    });

    it('clamps selectedIdx when deleting the currently-selected last page', async () => {
      apiGet.mockResolvedValue(JSON.stringify([legacyPage(), legacyPage(), legacyPage()]));
      const store = useRemoteControlStore();
      await store.loadRemoteControl();
      store.selectPage(2);

      store.deletePage(2);

      expect(store.selectedIdx).toBe(1);
    });

    it('shifts selectedIdx down when deleting a page below the current selection', async () => {
      apiGet.mockResolvedValue(JSON.stringify([legacyPage(), legacyPage(), legacyPage()]));
      const store = useRemoteControlStore();
      await store.loadRemoteControl();
      store.selectPage(2);

      store.deletePage(0);

      // Was idx 2, now at idx 1 because the page below it was removed.
      expect(store.selectedIdx).toBe(1);
    });

    it('keeps selectedIdx unchanged when deleting a page above the current selection', async () => {
      apiGet.mockResolvedValue(JSON.stringify([legacyPage(), legacyPage(), legacyPage()]));
      const store = useRemoteControlStore();
      await store.loadRemoteControl();
      store.selectPage(0);

      store.deletePage(2);

      expect(store.selectedIdx).toBe(0);
    });

    it('flips isDirty to true', async () => {
      apiGet.mockResolvedValue(JSON.stringify([legacyPage(), legacyPage()]));
      const store = useRemoteControlStore();
      await store.loadRemoteControl();

      store.deletePage(0);

      expect(store.isDirty).toBe(true);
    });

    it('no-ops on out-of-range idx without changing pages or isDirty', async () => {
      apiGet.mockResolvedValue(JSON.stringify([legacyPage(), legacyPage()]));
      const store = useRemoteControlStore();
      await store.loadRemoteControl();

      store.deletePage(-1);
      store.deletePage(99);

      expect(store.remoteControlPages).toHaveLength(2);
      expect(store.isDirty).toBe(false);
    });
  });

  describe('renamePage', () => {
    it('updates the name at the given index', async () => {
      apiGet.mockResolvedValue(JSON.stringify([legacyPage()]));
      const store = useRemoteControlStore();
      await store.loadRemoteControl();

      store.renamePage(0, 'Quick Actions');

      expect(store.remoteControlPages[0]!.name).toBe('Quick Actions');
    });

    it('trims surrounding whitespace before saving', async () => {
      apiGet.mockResolvedValue(JSON.stringify([legacyPage()]));
      const store = useRemoteControlStore();
      await store.loadRemoteControl();

      store.renamePage(0, '   Performance   ');

      expect(store.remoteControlPages[0]!.name).toBe('Performance');
    });

    it('no-ops on empty string (does not overwrite existing name or set dirty)', async () => {
      apiGet.mockResolvedValue(JSON.stringify([{ ...legacyPage(), name: 'Original' }]));
      const store = useRemoteControlStore();
      await store.loadRemoteControl();

      store.renamePage(0, '');

      expect(store.remoteControlPages[0]!.name).toBe('Original');
      expect(store.isDirty).toBe(false);
    });

    it('no-ops on whitespace-only string', async () => {
      apiGet.mockResolvedValue(JSON.stringify([{ ...legacyPage(), name: 'Original' }]));
      const store = useRemoteControlStore();
      await store.loadRemoteControl();

      store.renamePage(0, '   \t  ');

      expect(store.remoteControlPages[0]!.name).toBe('Original');
      expect(store.isDirty).toBe(false);
    });

    it('no-ops on out-of-range idx', async () => {
      apiGet.mockResolvedValue(JSON.stringify([legacyPage()]));
      const store = useRemoteControlStore();
      await store.loadRemoteControl();

      store.renamePage(99, 'NewName');
      store.renamePage(-1, 'NewName');

      expect(store.remoteControlPages[0]!.name).toBe('Page 1');
      expect(store.isDirty).toBe(false);
    });

    it('flips isDirty to true on a valid rename', async () => {
      apiGet.mockResolvedValue(JSON.stringify([legacyPage()]));
      const store = useRemoteControlStore();
      await store.loadRemoteControl();

      store.renamePage(0, 'New');

      expect(store.isDirty).toBe(true);
    });
  });
});
