import { describe, it, expect } from 'vitest';
import { TransmissionType } from 'src/models/index.js';
import {
  ControllerWatchdog,
  buildDownStatus,
  STATUS_STALE_TIMEOUT_MS,
  type ControllerIdentity,
} from './controller_watchdog.js';

const dome: ControllerIdentity = {
  controllerId: 'id-dome',
  controllerAddress: 'AA:BB:CC:DD:EE:01',
  controllerLocation: 'dome',
};
const body: ControllerIdentity = {
  controllerId: 'id-body',
  controllerAddress: 'AA:BB:CC:DD:EE:02',
  controllerLocation: 'body',
};

describe('ControllerWatchdog', () => {
  it('does not flag a controller still within the timeout window', () => {
    const wd = new ControllerWatchdog();
    wd.recordAck(dome, 1000);
    expect(wd.sweep(1000 + STATUS_STALE_TIMEOUT_MS)).toEqual([]); // exactly at threshold, not over
  });

  it('flags a controller that has been silent longer than the timeout', () => {
    const wd = new ControllerWatchdog();
    wd.recordAck(dome, 1000);
    expect(wd.sweep(1000 + STATUS_STALE_TIMEOUT_MS + 1)).toEqual([dome]);
  });

  it('respects a custom staleTimeoutMs passed to the constructor', () => {
    const wd = new ControllerWatchdog(500);
    wd.recordAck(dome, 0);
    expect(wd.sweep(500)).toEqual([]); // exactly at the custom threshold, not over
    expect(wd.sweep(501)).toEqual([dome]); // over it
  });

  it('emits a DOWN only once per outage (edge-triggered)', () => {
    const wd = new ControllerWatchdog();
    wd.recordAck(dome, 0);
    const first = wd.sweep(STATUS_STALE_TIMEOUT_MS + 1);
    const second = wd.sweep(STATUS_STALE_TIMEOUT_MS + 5000);
    expect(first).toEqual([dome]);
    expect(second).toEqual([]); // already down, do not re-emit
  });

  it('re-arms after a recovering ack and can flag DOWN again', () => {
    const wd = new ControllerWatchdog();
    wd.recordAck(dome, 0);
    expect(wd.sweep(STATUS_STALE_TIMEOUT_MS + 1)).toEqual([dome]);
    wd.recordAck(dome, 100_000); // recovered
    expect(wd.sweep(100_000 + 1)).toEqual([]); // fresh again
    expect(wd.sweep(100_000 + STATUS_STALE_TIMEOUT_MS + 1)).toEqual([dome]); // silent again
  });

  it('only flags the stale controller, not a fresh sibling', () => {
    const wd = new ControllerWatchdog();
    wd.recordAck(dome, 0);
    wd.recordAck(body, 9_000);
    expect(wd.sweep(STATUS_STALE_TIMEOUT_MS + 1)).toEqual([dome]); // body still fresh
  });

  it('never flags a controller it has never seen', () => {
    const wd = new ControllerWatchdog();
    expect(wd.sweep(1_000_000)).toEqual([]);
    expect(wd.markAllDown()).toEqual([]);
  });

  it('markAllDown flags every seen controller once, idempotently', () => {
    const wd = new ControllerWatchdog();
    wd.recordAck(dome, 0);
    wd.recordAck(body, 0);
    const all = wd.markAllDown();
    expect(all).toEqual(expect.arrayContaining([dome, body]));
    expect(all).toHaveLength(2);
    expect(wd.markAllDown()).toEqual([]); // already down
  });

  it('a sweep after markAllDown does not re-emit', () => {
    const wd = new ControllerWatchdog();
    wd.recordAck(dome, 0);
    wd.markAllDown();
    expect(wd.sweep(STATUS_STALE_TIMEOUT_MS + 1)).toEqual([]);
  });

  it('buildDownStatus produces a DOWN StatusResponse the UI renders as down', () => {
    expect(buildDownStatus(dome)).toEqual({
      type: TransmissionType.status,
      success: true,
      message: '',
      controllerId: 'id-dome',
      controllerAddress: 'AA:BB:CC:DD:EE:01',
      controllerLocation: 'dome',
      up: false,
      synced: false,
      firmwareVersion: '',
      firmwareCompatible: false,
    });
  });
});
