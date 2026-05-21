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
    // Vacuous-fix guard — verified mechanically. This test fails under
    // either of the following mutations to the production code:
    //   (a) Drop the clearArmTimer() call from cancel(): the queued arm
    //       timer fires when vi.advanceTimersByTime(600) runs below, calling
    //       onFire and tripping the final assertion.
    //   (b) Change holdMs's setTimeout delay to 0: the timer fires during
    //       vi.advanceTimersByTime(300) BEFORE cancel() executes, flipping
    //       state to 'active' and calling onFire — tripping both the state
    //       and onFire assertions.
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
    // Vacuous-fix guard: this catches a refactor that weakens the
    // `state !== 'idle'` guard to e.g. `state === 'active'`, which would
    // allow the second start() to queue a SECOND arm timer. The first timer
    // would still fire at +600ms (test passes the first two assertions),
    // but the second timer would fire at +900ms and call onFire AGAIN. The
    // final onFire-count assertion catches it.
    const onFire = vi.fn();
    const { result } = runInScope(() => useHoldGesture({ holdMs: 600, onFire }));
    result.start();
    vi.advanceTimersByTime(300);
    // Second start() — should NOT queue another arm timer.
    result.start();
    expect(result.state.value).toBe('arming');
    vi.advanceTimersByTime(300);
    // 600ms total elapsed from first start() — should have fired exactly once.
    expect(result.state.value).toBe('active');
    expect(onFire).toHaveBeenCalledTimes(1);
    // Advance past where a stray second arm timer (queued at +300ms) would
    // fire at +600ms-from-its-start = +900ms-from-first-start. The state
    // assertion above checks the immediate post-fire state; this one pins
    // that no orphan timer fires a second onFire later in the cooldown.
    vi.advanceTimersByTime(600);
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

  it('reset() while active does NOT leave an orphan cooldown timer that clobbers a later cycle', () => {
    // Vacuous-fix guard for the clearCooldownTimer() call in reset(). Without
    // this test, removing that line passes all other tests (the orphan
    // cooldown's callback sets state to 'idle' — a no-op when state is
    // already 'idle'). The bug it would allow: an orphan timer firing
    // mid-second-cycle clobbers the new 'active' lockout, dropping the
    // STOPPED visual early.
    const onFire = vi.fn();
    const { result } = runInScope(() => useHoldGesture({ holdMs: 600, cooldownMs: 2200, onFire }));
    result.start();
    vi.advanceTimersByTime(600);
    expect(result.state.value).toBe('active');
    result.reset(); // Must kill the cooldown timer.
    vi.advanceTimersByTime(1000); // 1.0s — still inside the original 2.2s cooldown window.
    result.start(); // Begin a new cycle from idle.
    vi.advanceTimersByTime(600);
    expect(result.state.value).toBe('active');
    vi.advanceTimersByTime(600); // Hits +2200ms mark of the ORIGINAL timer; must NOT fire.
    expect(result.state.value).toBe('active');
    vi.advanceTimersByTime(1600); // Hits +2200ms of cycle 2.
    expect(result.state.value).toBe('idle');
  });

  it('a throwing onFire still schedules the cooldown and recovers to idle', () => {
    // If a consumer's onFire handler throws, the gesture must NOT strand in
    // 'active' forever. The production code wraps onFire in try/finally so
    // the cooldown timer is always scheduled, and console.error surfaces
    // the throw for operators.
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const { result } = runInScope(() =>
        useHoldGesture({
          holdMs: 600,
          cooldownMs: 2200,
          onFire: () => {
            throw new Error('listener boom');
          },
        }),
      );
      result.start();
      vi.advanceTimersByTime(600);
      expect(result.state.value).toBe('active');
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('onFire callback threw'),
        expect.any(Error),
      );
      // The cooldown timer MUST have been scheduled by the finally block.
      vi.advanceTimersByTime(2200);
      expect(result.state.value).toBe('idle');
    } finally {
      errorSpy.mockRestore();
    }
  });

  it('routes a throwing onFire to onError when supplied (instead of console.error)', () => {
    // The console.error fallback exists only for consumers that haven't
    // wired their own logger. When onError is supplied, the throw must
    // reach it and NOT be double-logged to console.error.
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const onError = vi.fn();
    try {
      const { result } = runInScope(() =>
        useHoldGesture({
          holdMs: 600,
          cooldownMs: 2200,
          onFire: () => {
            throw new Error('listener boom');
          },
          onError,
        }),
      );
      result.start();
      vi.advanceTimersByTime(600);
      expect(onError).toHaveBeenCalledTimes(1);
      expect(onError).toHaveBeenCalledWith(expect.any(Error));
      expect(errorSpy).not.toHaveBeenCalled();
      // Cooldown still schedules — the error path must not break recovery.
      vi.advanceTimersByTime(2200);
      expect(result.state.value).toBe('idle');
    } finally {
      errorSpy.mockRestore();
    }
  });

  it('a throwing onError is contained and logs both errors without stranding the gesture', () => {
    // Vacuous-fix guard — verified mechanically. This test fails under
    // either of the following mutations to the production code:
    //   (a) Remove the inner try/catch around the onError call: the
    //       handlerErr escapes the setTimeout callback (uncaught, surfaces
    //       as a Vitest unhandled rejection) AND the cooldown still
    //       schedules so state reaches idle — but the unhandled rejection
    //       trips the final assertion that no rejection occurred.
    //   (b) Drop the second console.error (the one logging handlerErr): the
    //       "onError handler threw" string assertion below fails.
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const handlerError = new Error('handler boom');
    try {
      const { result } = runInScope(() =>
        useHoldGesture({
          holdMs: 600,
          cooldownMs: 2200,
          onFire: () => {
            throw new Error('listener boom');
          },
          onError: () => {
            throw handlerError;
          },
        }),
      );
      result.start();
      vi.advanceTimersByTime(600);
      expect(result.state.value).toBe('active');
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('onError handler threw'),
        handlerError,
        expect.stringContaining('original'),
        expect.any(Error),
      );
      // Cooldown still recovers — this is the load-bearing safety property.
      vi.advanceTimersByTime(2200);
      expect(result.state.value).toBe('idle');
    } finally {
      errorSpy.mockRestore();
    }
  });

  it('an async onError whose promise rejects is caught and logged with the original error', async () => {
    // Vacuous-fix guard — verified mechanically. Removing the
    // Promise.resolve(...).catch(...) wrap around the onError call lets the
    // returned rejected promise become an unhandled rejection on
    // window.onerror — the synchronous try/catch only catches sync throws,
    // not awaited rejections. This test fails under that mutation because
    // the "onError handler rejected" string assertion never matches.
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const handlerError = new Error('async handler boom');
    try {
      const { result } = runInScope(() =>
        useHoldGesture({
          holdMs: 600,
          cooldownMs: 2200,
          onFire: () => {
            throw new Error('listener boom');
          },
          onError: async () => {
            throw handlerError;
          },
        }),
      );
      result.start();
      vi.advanceTimersByTime(600);
      // Let the microtask queue drain so the rejected promise's catch runs.
      await Promise.resolve();
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('onError handler rejected'),
        handlerError,
        expect.stringContaining('original'),
        expect.any(Error),
      );
      // Cooldown still recovers — the load-bearing safety property.
      vi.advanceTimersByTime(2200);
      expect(result.state.value).toBe('idle');
    } finally {
      errorSpy.mockRestore();
    }
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
