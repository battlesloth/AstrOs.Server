import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

vi.mock('@/api/apiService', () => ({
  default: {
    get: vi.fn(),
  },
}));

import apiService from '@/api/apiService';
import { useSystemStatusStore } from '../systemStatus';

const apiGet = apiService.get as ReturnType<typeof vi.fn>;

describe('systemStatus store', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    apiGet.mockReset();
  });

  it('starts with default not-read-only state', () => {
    const store = useSystemStatusStore();
    expect(store.readOnly).toBe(false);
    expect(store.reasonCode).toBeNull();
    expect(store.enteredAt).toBeNull();
  });

  describe('setStatus', () => {
    it('transitions to read-only with reasonCode and enteredAt', () => {
      const store = useSystemStatusStore();

      store.setStatus({
        readOnly: true,
        reasonCode: 'BACKUP_FAILED',
        enteredAt: '2026-04-26T00:00:00.000Z',
      });

      expect(store.readOnly).toBe(true);
      expect(store.reasonCode).toBe('BACKUP_FAILED');
      expect(store.enteredAt).toBe('2026-04-26T00:00:00.000Z');
    });

    it('transitions back to not-read-only and clears reasonCode/enteredAt', () => {
      const store = useSystemStatusStore();
      store.setStatus({
        readOnly: true,
        reasonCode: 'BACKUP_FAILED',
        enteredAt: '2026-04-26T00:00:00.000Z',
      });

      store.setStatus({ readOnly: false });

      expect(store.readOnly).toBe(false);
      expect(store.reasonCode).toBeNull();
      expect(store.enteredAt).toBeNull();
    });

    it('handles partial payloads without enteredAt', () => {
      const store = useSystemStatusStore();

      store.setStatus({ readOnly: true, reasonCode: 'STARTUP_OPEN_FAILED' });

      expect(store.readOnly).toBe(true);
      expect(store.reasonCode).toBe('STARTUP_OPEN_FAILED');
      expect(store.enteredAt).toBeNull();
    });

    it('coerces missing reasonCode to null even when readOnly is true', () => {
      const store = useSystemStatusStore();
      store.setStatus({ readOnly: true });
      expect(store.reasonCode).toBeNull();
    });
  });

  describe('dbIncompatible', () => {
    it('dbIncompatible is true only for DB_NEWER_THAN_SERVER', () => {
      const store = useSystemStatusStore();
      expect(store.dbIncompatible).toBe(false);

      store.setStatus({ readOnly: true, reasonCode: 'MIGRATION_FAILED_RESTORED' });
      expect(store.dbIncompatible).toBe(false);

      store.setStatus({ readOnly: true, reasonCode: 'DB_NEWER_THAN_SERVER' });
      expect(store.dbIncompatible).toBe(true);
    });

    it.each([
      'STARTUP_OPEN_FAILED',
      'BACKUP_FAILED',
      'MIGRATION_FAILED_NO_BACKUP',
      'MIGRATION_FAILED_RESTORED',
      'MIGRATION_FAILED_RESTORE_FAILED',
    ] as const)('dbIncompatible is false for %s', (reasonCode) => {
      const store = useSystemStatusStore();
      store.setStatus({ readOnly: true, reasonCode });
      expect(store.dbIncompatible).toBe(false);
    });

    it('dbIncompatible is false when readOnly is false', () => {
      const store = useSystemStatusStore();
      store.setStatus({ readOnly: true, reasonCode: 'DB_NEWER_THAN_SERVER' });

      store.setStatus({ readOnly: false, reasonCode: 'DB_NEWER_THAN_SERVER' });

      expect(store.dbIncompatible).toBe(false);
    });
  });

  describe('fetchStatus', () => {
    it('updates state from a successful GET response', async () => {
      apiGet.mockResolvedValueOnce({
        readOnly: true,
        reasonCode: 'MIGRATION_FAILED_NO_BACKUP',
        enteredAt: '2026-04-26T00:00:00.000Z',
      });

      const store = useSystemStatusStore();
      await store.fetchStatus();

      expect(apiGet).toHaveBeenCalledWith('api/system/status');
      expect(store.readOnly).toBe(true);
      expect(store.reasonCode).toBe('MIGRATION_FAILED_NO_BACKUP');
      expect(store.enteredAt).toBe('2026-04-26T00:00:00.000Z');
    });

    it('updates state from a not-read-only GET response', async () => {
      apiGet.mockResolvedValueOnce({ readOnly: false });

      const store = useSystemStatusStore();
      // Pre-seed with a prior read-only state so we can verify it gets cleared
      store.setStatus({ readOnly: true, reasonCode: 'BACKUP_FAILED' });

      await store.fetchStatus();

      expect(store.readOnly).toBe(false);
      expect(store.reasonCode).toBeNull();
    });

    it('leaves state unchanged on fetch failure (does not throw)', async () => {
      apiGet.mockRejectedValueOnce(new Error('network'));

      const store = useSystemStatusStore();
      store.setStatus({ readOnly: true, reasonCode: 'BACKUP_FAILED' });

      await expect(store.fetchStatus()).resolves.toBeUndefined();

      expect(store.readOnly).toBe(true);
      expect(store.reasonCode).toBe('BACKUP_FAILED');
    });
  });
});
