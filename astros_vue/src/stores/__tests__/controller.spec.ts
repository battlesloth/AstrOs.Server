import { describe, it, expect, beforeEach } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useControllerStore } from '../controller';
import { Location } from '@/enums';

describe('controller store MAC↔location mapping', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  describe('initial seed', () => {
    it('seeds body with the master sentinel MAC so cold-load resolves the master before any LocationStatus', () => {
      const store = useControllerStore();
      expect(store.bodyMac).toBe('00:00:00:00:00:00');
      expect(store.coreMac).toBeNull();
      expect(store.domeMac).toBeNull();
      // Sentinel must resolve to BODY even on cold-load — the firmware view's
      // master row depends on this before any padawan POLL_ACK arrives.
      expect(store.controllerIdToLocation('00:00:00:00:00:00')).toBe(Location.BODY);
    });
  });

  describe('setControllerMac', () => {
    it('sets coreMac for Location.CORE and resolves the MAC back to CORE', () => {
      const store = useControllerStore();
      store.setControllerMac(Location.CORE, 'aa:bb:cc:dd:ee:01');
      expect(store.coreMac).toBe('aa:bb:cc:dd:ee:01');
      expect(store.controllerIdToLocation('aa:bb:cc:dd:ee:01')).toBe(Location.CORE);
    });

    it('sets domeMac for Location.DOME and resolves the MAC back to DOME', () => {
      const store = useControllerStore();
      store.setControllerMac(Location.DOME, 'aa:bb:cc:dd:ee:02');
      expect(store.domeMac).toBe('aa:bb:cc:dd:ee:02');
      expect(store.controllerIdToLocation('aa:bb:cc:dd:ee:02')).toBe(Location.DOME);
    });

    it('overwrites bodyMac for Location.BODY if a real MAC ever arrives', () => {
      // Defensive: body is normally seeded with the sentinel and never
      // overwritten, but if a future firmware reports a real master MAC on
      // POLL_ACK, the setter must not silently drop the update.
      const store = useControllerStore();
      store.setControllerMac(Location.BODY, 'aa:bb:cc:dd:ee:00');
      expect(store.bodyMac).toBe('aa:bb:cc:dd:ee:00');
      expect(store.controllerIdToLocation('aa:bb:cc:dd:ee:00')).toBe(Location.BODY);
    });

    it('is a no-op for Location.UNKNOWN so an unmapped slot does not pollute the table', () => {
      // Reason: UNKNOWN is the "unassigned location" sentinel. A LocationStatus
      // with UNKNOWN would otherwise either throw on an exhaustive switch or
      // (worse) write to one of the three real slots. Verify nothing changes.
      const store = useControllerStore();
      const snap = {
        body: store.bodyMac,
        core: store.coreMac,
        dome: store.domeMac,
      };
      store.setControllerMac(Location.UNKNOWN, 'aa:bb:cc:dd:ee:ff');
      expect(store.bodyMac).toBe(snap.body);
      expect(store.coreMac).toBe(snap.core);
      expect(store.domeMac).toBe(snap.dome);
      expect(store.controllerIdToLocation('aa:bb:cc:dd:ee:ff')).toBeNull();
    });
  });

  describe('controllerIdToLocation', () => {
    it('returns null for an unknown MAC so callers can surface a dev warning instead of mis-routing the event', () => {
      const store = useControllerStore();
      expect(store.controllerIdToLocation('not-a-known-mac')).toBeNull();
    });

    it('re-derives the map when a MAC is replaced so stale entries do not persist', () => {
      // Pins reactivity: a controller swap (RMA / repair) must invalidate the
      // prior MAC. If we cached the map without depending on coreMac.value,
      // the old MAC would keep resolving to CORE.
      const store = useControllerStore();
      store.setControllerMac(Location.CORE, 'aa:bb:cc:dd:ee:01');
      expect(store.controllerIdToLocation('aa:bb:cc:dd:ee:01')).toBe(Location.CORE);

      store.setControllerMac(Location.CORE, 'aa:bb:cc:dd:ee:99');
      expect(store.controllerIdToLocation('aa:bb:cc:dd:ee:99')).toBe(Location.CORE);
      expect(store.controllerIdToLocation('aa:bb:cc:dd:ee:01')).toBeNull();
    });
  });
});
