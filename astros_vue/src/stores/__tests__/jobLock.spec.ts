import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

vi.mock('@/api/apiService', () => ({
  default: {
    get: vi.fn(),
  },
}));

import apiService from '@/api/apiService';
import { useJobLockStore } from '../jobLock';

const apiGet = apiService.get as ReturnType<typeof vi.fn>;

describe('jobLock store', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    apiGet.mockReset();
  });

  it('starts unlocked with no owner', () => {
    const store = useJobLockStore();

    expect(store.locked).toBe(false);
    expect(store.owner).toBeNull();
    expect(store.since).toBeNull();
  });

  it('setState applies a locked LockState payload', () => {
    const store = useJobLockStore();

    store.setState({
      locked: true,
      owner: 'flashJob:abc',
      since: '2026-04-28T07:30:00.000Z',
    });

    expect(store.locked).toBe(true);
    expect(store.owner).toBe('flashJob:abc');
    expect(store.since).toBe('2026-04-28T07:30:00.000Z');
  });

  it('setState clears owner and since when transitioning to unlocked', () => {
    const store = useJobLockStore();
    store.setState({
      locked: true,
      owner: 'flashJob:abc',
      since: '2026-04-28T07:30:00.000Z',
    });

    store.setState({ locked: false, owner: null, since: null });

    expect(store.locked).toBe(false);
    expect(store.owner).toBeNull();
    expect(store.since).toBeNull();
  });

  describe('fetchLockState', () => {
    it('updates state from a successful locked GET response', async () => {
      apiGet.mockResolvedValueOnce({
        locked: true,
        owner: 'flashJob:abc',
        since: '2026-04-28T07:30:00.000Z',
      });

      const store = useJobLockStore();
      await store.fetchLockState();

      expect(apiGet).toHaveBeenCalledWith('api/firmware/lock-state');
      expect(store.locked).toBe(true);
      expect(store.owner).toBe('flashJob:abc');
      expect(store.since).toBe('2026-04-28T07:30:00.000Z');
    });

    it('clears state from a successful unlocked GET response', async () => {
      apiGet.mockResolvedValueOnce({ locked: false, owner: null, since: null });

      const store = useJobLockStore();
      // Pre-seed with a prior locked state so we can verify it gets cleared
      store.setState({
        locked: true,
        owner: 'flashJob:abc',
        since: '2026-04-28T07:30:00.000Z',
      });

      await store.fetchLockState();

      expect(store.locked).toBe(false);
      expect(store.owner).toBeNull();
      expect(store.since).toBeNull();
    });

    it('leaves state unchanged on fetch failure (does not throw)', async () => {
      apiGet.mockRejectedValueOnce(new Error('network'));

      const store = useJobLockStore();
      store.setState({
        locked: true,
        owner: 'flashJob:abc',
        since: '2026-04-28T07:30:00.000Z',
      });

      await expect(store.fetchLockState()).resolves.toBeUndefined();

      expect(store.locked).toBe(true);
      expect(store.owner).toBe('flashJob:abc');
      expect(store.since).toBe('2026-04-28T07:30:00.000Z');
    });
  });
});
