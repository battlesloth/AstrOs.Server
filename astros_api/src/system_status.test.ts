import { describe, it, expect, vi } from 'vitest';
import { SystemStatus } from './system_status.js';

describe('SystemStatus', () => {
  it('starts not in read-only mode', () => {
    const status = new SystemStatus();
    expect(status.isReadOnly()).toBe(false);
    expect(status.getState()).toEqual({ readOnly: false });
  });

  it('captures reason and timestamp on enterReadOnly', () => {
    const status = new SystemStatus();
    const before = Date.now();
    status.enterReadOnly('migration failed: bad sql');
    const after = Date.now();

    const state = status.getState();
    expect(state.readOnly).toBe(true);
    expect(state.reason).toBe('migration failed: bad sql');
    expect(state.enteredAt).toBeDefined();
    const enteredAtMs = Date.parse(state.enteredAt ?? '');
    expect(enteredAtMs).toBeGreaterThanOrEqual(before);
    expect(enteredAtMs).toBeLessThanOrEqual(after);
  });

  it('isReadOnly returns true once entered', () => {
    const status = new SystemStatus();
    status.enterReadOnly('any reason');
    expect(status.isReadOnly()).toBe(true);
  });

  it('notifies subscribers on enterReadOnly', () => {
    const status = new SystemStatus();
    const cb = vi.fn();
    status.subscribe(cb);

    status.enterReadOnly('disk full');
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledWith(
      expect.objectContaining({ readOnly: true, reason: 'disk full' }),
    );
  });

  it('notifies multiple subscribers', () => {
    const status = new SystemStatus();
    const cb1 = vi.fn();
    const cb2 = vi.fn();
    status.subscribe(cb1);
    status.subscribe(cb2);

    status.enterReadOnly('boom');
    expect(cb1).toHaveBeenCalledTimes(1);
    expect(cb2).toHaveBeenCalledTimes(1);
  });

  it('subscribe returns an unsubscribe function', () => {
    const status = new SystemStatus();
    const cb = vi.fn();
    const unsubscribe = status.subscribe(cb);
    unsubscribe();

    status.enterReadOnly('boom');
    expect(cb).not.toHaveBeenCalled();
  });

  it('only notifies on the first enterReadOnly (no double-fire)', () => {
    const status = new SystemStatus();
    const cb = vi.fn();
    status.subscribe(cb);

    status.enterReadOnly('first');
    status.enterReadOnly('second');

    expect(cb).toHaveBeenCalledTimes(1);
    const state = status.getState();
    expect(state.reason).toBe('first');
  });

  it('subscriber errors do not affect other subscribers', () => {
    const status = new SystemStatus();
    const failing = vi.fn(() => {
      throw new Error('subscriber broke');
    });
    const ok = vi.fn();
    status.subscribe(failing);
    status.subscribe(ok);

    expect(() => status.enterReadOnly('boom')).not.toThrow();
    expect(ok).toHaveBeenCalledTimes(1);
  });
});
