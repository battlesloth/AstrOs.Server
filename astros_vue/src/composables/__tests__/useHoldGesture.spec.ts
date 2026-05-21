import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { effectScope } from 'vue';
import { useHoldGesture } from '../useHoldGesture';

// The composable uses setTimeout for both the holdMs arm timer and the
// cooldownMs lockout. Drive time deterministically with fake timers so
// state transitions are independent of real-time variance.
beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

// Run the composable inside an effect scope so onScopeDispose hooks have a
// real owner; otherwise Vue logs a warning every test ("onScopeDispose is
// called when there is no active effect scope").
function runInScope<T>(fn: () => T): { result: T; scope: ReturnType<typeof effectScope> } {
  const scope = effectScope();
  const result = scope.run(fn) as T;
  return { result, scope };
}

describe('useHoldGesture', () => {
  it('starts in the idle state', () => {
    const { result } = runInScope(() => useHoldGesture());
    expect(result.state.value).toBe('idle');
  });

  it('transitions idle → arming on start()', () => {
    const { result } = runInScope(() => useHoldGesture());
    result.start();
    expect(result.state.value).toBe('arming');
  });

  it('transitions arming → active after holdMs and fires onFire exactly once', () => {
    const onFire = vi.fn();
    const { result } = runInScope(() => useHoldGesture({ holdMs: 600, onFire }));
    result.start();
    expect(onFire).not.toHaveBeenCalled();
    vi.advanceTimersByTime(599);
    expect(result.state.value).toBe('arming');
    expect(onFire).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(result.state.value).toBe('active');
    expect(onFire).toHaveBeenCalledTimes(1);
  });

  it('cancel() during arming returns to idle and does NOT fire onFire', () => {
    // Vacuous-fix guard: if clearArmTimer() were dropped from cancel(), the
    // arm timer would stay queued and fire when vi.advanceTimersByTime(600)
    // runs below — calling onFire and failing the final assertion. Verified
    // mechanically: removing the clearArmTimer call from cancel() makes the
    // expect(onFire).not.toHaveBeenCalled() line fail.
    // (Note on the fake-timer environment: a 0ms setTimeout would NOT fire
    // automatically here — fake timers only run when time is advanced — so
    // the real mutation the guard catches is the missing clearArmTimer call,
    // not the delay value.)
    const onFire = vi.fn();
    const { result } = runInScope(() => useHoldGesture({ holdMs: 600, onFire }));
    result.start();
    vi.advanceTimersByTime(300);
    result.cancel();
    expect(result.state.value).toBe('idle');
    vi.advanceTimersByTime(600);
    expect(onFire).not.toHaveBeenCalled();
  });

  it('cancel() during active is a no-op AND does not disrupt cooldown completion', () => {
    // The contract has two parts: (1) cancel() must not flip active → idle
    // immediately (the lockout has to last cooldownMs), and (2) it must not
    // accidentally clear the cooldown timer either — a future refactor that
    // calls clearCooldownTimer() before the arming-state guard would leave
    // state stuck at 'active' forever. The clock-advance assertion below
    // catches that mutation.
    const onFire = vi.fn();
    const { result } = runInScope(() => useHoldGesture({ holdMs: 600, cooldownMs: 2200, onFire }));
    result.start();
    vi.advanceTimersByTime(600);
    expect(result.state.value).toBe('active');
    result.cancel();
    expect(result.state.value).toBe('active');
    vi.advanceTimersByTime(2200);
    expect(result.state.value).toBe('idle');
  });

  it('transitions active → idle after cooldownMs', () => {
    const { result } = runInScope(() => useHoldGesture({ holdMs: 600, cooldownMs: 2200 }));
    result.start();
    vi.advanceTimersByTime(600);
    expect(result.state.value).toBe('active');
    vi.advanceTimersByTime(2199);
    expect(result.state.value).toBe('active');
    vi.advanceTimersByTime(1);
    expect(result.state.value).toBe('idle');
  });

  it('start() while not idle is a no-op (does not re-arm or extend timers)', () => {
    const onFire = vi.fn();
    const { result } = runInScope(() => useHoldGesture({ holdMs: 600, onFire }));
    result.start();
    vi.advanceTimersByTime(300);
    // Second start() — should NOT reset the 600ms timer
    result.start();
    expect(result.state.value).toBe('arming');
    vi.advanceTimersByTime(300);
    // 600ms total elapsed from first start() — should have fired
    expect(result.state.value).toBe('active');
    expect(onFire).toHaveBeenCalledTimes(1);
  });

  it('start() during active is ignored (gesture is locked out until cooldown completes)', () => {
    const onFire = vi.fn();
    const { result } = runInScope(() => useHoldGesture({ holdMs: 600, cooldownMs: 2200, onFire }));
    result.start();
    vi.advanceTimersByTime(600);
    expect(result.state.value).toBe('active');
    result.start();
    expect(result.state.value).toBe('active');
    vi.advanceTimersByTime(2200);
    expect(result.state.value).toBe('idle');
    expect(onFire).toHaveBeenCalledTimes(1);
  });

  it('reset() while arming clears the pending fire and returns to idle', () => {
    const onFire = vi.fn();
    const { result } = runInScope(() => useHoldGesture({ holdMs: 600, onFire }));
    result.start();
    vi.advanceTimersByTime(300);
    result.reset();
    expect(result.state.value).toBe('idle');
    vi.advanceTimersByTime(1000);
    expect(onFire).not.toHaveBeenCalled();
  });

  it('reset() while active clears the cooldown timer and returns to idle immediately', () => {
    const onFire = vi.fn();
    const { result } = runInScope(() => useHoldGesture({ holdMs: 600, cooldownMs: 2200, onFire }));
    result.start();
    vi.advanceTimersByTime(600);
    expect(result.state.value).toBe('active');
    result.reset();
    expect(result.state.value).toBe('idle');
    // The original cooldown timer must NOT fire again and flip something later.
    vi.advanceTimersByTime(3000);
    expect(result.state.value).toBe('idle');
  });

  it('respects custom holdMs and cooldownMs values', () => {
    const onFire = vi.fn();
    const { result } = runInScope(() => useHoldGesture({ holdMs: 1000, cooldownMs: 500, onFire }));
    result.start();
    vi.advanceTimersByTime(999);
    expect(result.state.value).toBe('arming');
    vi.advanceTimersByTime(1);
    expect(result.state.value).toBe('active');
    expect(onFire).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(500);
    expect(result.state.value).toBe('idle');
  });

  it('a full cycle can be repeated cleanly: idle → arming → active → idle → arming → active', () => {
    const onFire = vi.fn();
    const { result } = runInScope(() => useHoldGesture({ holdMs: 600, cooldownMs: 2200, onFire }));
    result.start();
    vi.advanceTimersByTime(600);
    expect(result.state.value).toBe('active');
    vi.advanceTimersByTime(2200);
    expect(result.state.value).toBe('idle');
    result.start();
    vi.advanceTimersByTime(600);
    expect(result.state.value).toBe('active');
    expect(onFire).toHaveBeenCalledTimes(2);
  });

  it('cleans up pending timers when the parent scope is disposed', () => {
    const onFire = vi.fn();
    const { result, scope } = runInScope(() =>
      useHoldGesture({ holdMs: 600, cooldownMs: 2200, onFire }),
    );
    result.start();
    vi.advanceTimersByTime(300);
    scope.stop();
    // After scope disposal, any pending timers must NOT fire onFire or
    // attempt to mutate the (now-detached) state ref.
    vi.advanceTimersByTime(2000);
    expect(onFire).not.toHaveBeenCalled();
  });
});
