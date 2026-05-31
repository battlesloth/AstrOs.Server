import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

vi.mock('@/api/apiService', () => ({
  default: { get: vi.fn() },
}));

import apiService from '@/api/apiService';
import { usePanicStateStore } from '../panicState';

const apiGet = apiService.get as ReturnType<typeof vi.fn>;

describe('panicState store', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    apiGet.mockReset();
  });

  it('starts not in panic stop', () => {
    expect(usePanicStateStore().inPanicStop).toBe(false);
  });

  it('setState applies the payload', () => {
    const store = usePanicStateStore();
    store.setState({ inPanicStop: true });
    expect(store.inPanicStop).toBe(true);
    store.setState({ inPanicStop: false });
    expect(store.inPanicStop).toBe(false);
  });

  it('fetchPanicState hydrates from the GET response', async () => {
    apiGet.mockResolvedValueOnce({ inPanicStop: true });
    const store = usePanicStateStore();
    await store.fetchPanicState();
    expect(apiGet).toHaveBeenCalledWith('api/panicState');
    expect(store.inPanicStop).toBe(true);
  });

  it('leaves state unchanged on fetch failure (does not throw)', async () => {
    apiGet.mockRejectedValueOnce(new Error('network'));
    const store = usePanicStateStore();
    store.setState({ inPanicStop: true });
    await expect(store.fetchPanicState()).resolves.toBeUndefined();
    expect(store.inPanicStop).toBe(true);
  });
});
