import { describe, it, expect, vi } from 'vitest';
import { SystemStatus } from './system_status.js';

describe('SystemStatus', () => {
  it('starts not in read-only mode', () => {
    const status = new SystemStatus();
    expect(status.isReadOnly()).toBe(false);
    expect(status.getState()).toEqual({ readOnly: false });
  });

  it('captures reasonCode and timestamp on enterReadOnly', () => {
    const status = new SystemStatus();
    const before = Date.now();
    status.enterReadOnly('BACKUP_FAILED');
    const after = Date.now();

    const state = status.getState();
    expect(state.readOnly).toBe(true);
    expect(state.reasonCode).toBe('BACKUP_FAILED');
    expect(state.enteredAt).toBeDefined();
    const enteredAtMs = Date.parse(state.enteredAt ?? '');
    expect(enteredAtMs).toBeGreaterThanOrEqual(before);
    expect(enteredAtMs).toBeLessThanOrEqual(after);
  });

  it('does not expose the raw error detail on the public state', () => {
    const status = new SystemStatus();
    const sensitive = new Error('ENOENT: /home/user/.config/astrosserver/database.sqlite3');
    status.enterReadOnly('BACKUP_FAILED', sensitive);

    const state = status.getState();
    expect(state.reasonCode).toBe('BACKUP_FAILED');
    expect(JSON.stringify(state)).not.toContain('ENOENT');
    expect(JSON.stringify(state)).not.toContain('astrosserver');
    expect(state).not.toHaveProperty('reason');
    expect(state).not.toHaveProperty('detail');
  });

  it('isReadOnly returns true once entered', () => {
    const status = new SystemStatus();
    status.enterReadOnly('MIGRATION_FAILED_NO_BACKUP');
    expect(status.isReadOnly()).toBe(true);
  });

  it('isDbIncompatible is true only for DB_NEWER_THAN_SERVER', () => {
    expect(new SystemStatus().isDbIncompatible()).toBe(false);

    const newer = new SystemStatus();
    newer.enterReadOnly('DB_NEWER_THAN_SERVER');
    expect(newer.isDbIncompatible()).toBe(true);
    expect(newer.isReadOnly()).toBe(true);
  });

  it.each([
    'STARTUP_OPEN_FAILED',
    'BACKUP_FAILED',
    'MIGRATION_FAILED_NO_BACKUP',
    'MIGRATION_FAILED_RESTORED',
    'MIGRATION_FAILED_RESTORE_FAILED',
  ] as const)('isDbIncompatible is false for %s', (code) => {
    const status = new SystemStatus();
    status.enterReadOnly(code);
    expect(status.isDbIncompatible()).toBe(false);
  });

  it('notifies subscribers on enterReadOnly', () => {
    const status = new SystemStatus();
    const cb = vi.fn();
    status.subscribe(cb);

    status.enterReadOnly('BACKUP_FAILED');
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledWith(
      expect.objectContaining({ readOnly: true, reasonCode: 'BACKUP_FAILED' }),
    );
  });

  it('notifies multiple subscribers', () => {
    const status = new SystemStatus();
    const cb1 = vi.fn();
    const cb2 = vi.fn();
    status.subscribe(cb1);
    status.subscribe(cb2);

    status.enterReadOnly('BACKUP_FAILED');
    expect(cb1).toHaveBeenCalledTimes(1);
    expect(cb2).toHaveBeenCalledTimes(1);
  });

  it('subscribe returns an unsubscribe function', () => {
    const status = new SystemStatus();
    const cb = vi.fn();
    const unsubscribe = status.subscribe(cb);
    unsubscribe();

    status.enterReadOnly('BACKUP_FAILED');
    expect(cb).not.toHaveBeenCalled();
  });

  it('only notifies on the first enterReadOnly (no double-fire)', () => {
    const status = new SystemStatus();
    const cb = vi.fn();
    status.subscribe(cb);

    status.enterReadOnly('BACKUP_FAILED');
    status.enterReadOnly('MIGRATION_FAILED_NO_BACKUP');

    expect(cb).toHaveBeenCalledTimes(1);
    const state = status.getState();
    expect(state.reasonCode).toBe('BACKUP_FAILED');
  });

  it('subscriber errors do not affect other subscribers', () => {
    const status = new SystemStatus();
    const failing = vi.fn(() => {
      throw new Error('subscriber broke');
    });
    const ok = vi.fn();
    status.subscribe(failing);
    status.subscribe(ok);

    expect(() => status.enterReadOnly('BACKUP_FAILED')).not.toThrow();
    expect(ok).toHaveBeenCalledTimes(1);
  });
});
