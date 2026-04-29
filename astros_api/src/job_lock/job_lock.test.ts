import { describe, it, expect } from 'vitest';
import { JobLock } from './job_lock.js';
import type { LockState } from '../models/networking/lock_responses.js';

describe('JobLock', () => {
  it('starts unlocked with no owner', () => {
    const lock = new JobLock();

    expect(lock.isLocked()).toBe(false);
    expect(lock.getOwner()).toBe(null);
  });

  it('acquire on unlocked lock returns true and records owner + timestamp', () => {
    const lock = new JobLock();

    const before = Date.now();
    const acquired = lock.acquire('flashJob:abc');
    const after = Date.now();

    expect(acquired).toBe(true);
    expect(lock.isLocked()).toBe(true);
    expect(lock.getOwner()).toBe('flashJob:abc');
    // since() should be an ISO-8601 string. Don't pin the exact value;
    // assert it parses to a Date close to now.
    const since = lock.getSince();
    expect(since).not.toBeNull();
    if (since === null) throw new Error('unreachable: since asserted non-null above');
    const sinceMs = new Date(since).getTime();
    expect(Number.isNaN(sinceMs)).toBe(false);
    expect(sinceMs).toBeGreaterThanOrEqual(before);
    expect(sinceMs).toBeLessThanOrEqual(after);
  });

  it('acquire on locked lock returns false and preserves existing owner', () => {
    const lock = new JobLock();
    lock.acquire('first');

    const acquired = lock.acquire('second');

    expect(acquired).toBe(false);
    expect(lock.getOwner()).toBe('first');
  });

  it('release by owner returns true and clears state', () => {
    const lock = new JobLock();
    lock.acquire('owner-1');

    const released = lock.release('owner-1');

    expect(released).toBe(true);
    expect(lock.isLocked()).toBe(false);
    expect(lock.getOwner()).toBe(null);
    expect(lock.getSince()).toBe(null);
  });

  it('release by non-owner returns false and keeps lock held', () => {
    const lock = new JobLock();
    lock.acquire('rightful-owner');

    const released = lock.release('imposter');

    expect(released).toBe(false);
    expect(lock.isLocked()).toBe(true);
    expect(lock.getOwner()).toBe('rightful-owner');
  });

  it('release on unlocked lock returns false', () => {
    const lock = new JobLock();

    const released = lock.release('anybody');

    expect(released).toBe(false);
    expect(lock.isLocked()).toBe(false);
  });

  it('getState returns a LockState reflecting current state', () => {
    const lock = new JobLock();

    expect(lock.getState()).toEqual({ locked: false, owner: null, since: null });

    lock.acquire('owner-x');
    const state = lock.getState();
    expect(state.locked).toBe(true);
    expect(state.owner).toBe('owner-x');
    expect(state.since).not.toBeNull();
  });

  it('subscribe is notified on acquire with the new state', () => {
    const lock = new JobLock();
    const calls: LockState[] = [];
    lock.subscribe((s) => calls.push(s));

    lock.acquire('owner-1');

    expect(calls).toHaveLength(1);
    expect(calls[0].locked).toBe(true);
    expect(calls[0].owner).toBe('owner-1');
    expect(calls[0].since).not.toBeNull();
  });

  it('subscribe is notified on release with the cleared state', () => {
    const lock = new JobLock();
    lock.acquire('owner-1');
    const calls: LockState[] = [];
    lock.subscribe((s) => calls.push(s));

    lock.release('owner-1');

    expect(calls).toHaveLength(1);
    expect(calls[0].locked).toBe(false);
    expect(calls[0].owner).toBe(null);
    expect(calls[0].since).toBe(null);
  });

  it('unsubscribe stops further notifications', () => {
    const lock = new JobLock();
    const calls: LockState[] = [];
    const unsubscribe = lock.subscribe((s) => calls.push(s));

    unsubscribe();
    lock.acquire('owner-1');
    lock.release('owner-1');

    expect(calls).toHaveLength(0);
  });

  it('failed acquire does not notify subscribers', () => {
    const lock = new JobLock();
    lock.acquire('first');
    const calls: LockState[] = [];
    lock.subscribe((s) => calls.push(s));

    const acquired = lock.acquire('second');

    expect(acquired).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it('failed release does not notify subscribers', () => {
    const lock = new JobLock();
    lock.acquire('first');
    const calls: LockState[] = [];
    lock.subscribe((s) => calls.push(s));

    lock.release('imposter');

    expect(calls).toHaveLength(0);
  });
});
