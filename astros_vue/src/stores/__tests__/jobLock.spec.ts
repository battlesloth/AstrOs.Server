import { describe, it, expect, beforeEach } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useJobLockStore } from '../jobLock';

describe('jobLock store', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
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
});
