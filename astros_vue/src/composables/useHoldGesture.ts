import { readonly, ref, onScopeDispose, type Ref } from 'vue';

// Refined from the plan's 4-state model (idle | arming | active | cooldown):
// the design's "active" IS the cooldown — the button shows STOPPED for the
// entire lockout window and resets to idle when it expires. There's no
// observable difference between an `active` and a separate `cooldown` state,
// so the simpler 3-state machine is equivalent. If a future visual treatment
// needs to distinguish "just-fired" from "cooling-down", reintroduce
// `cooldown` here and update the consumer's state checks.
export type HoldGestureState = 'idle' | 'arming' | 'active';

export interface UseHoldGestureOptions {
  /** How long the user must hold before the gesture fires. Default 600ms. */
  holdMs?: number;
  /** How long the gesture stays in the `active` lockout after firing. Default 2200ms. */
  cooldownMs?: number;
  /** Called once when the gesture transitions from `arming` to `active`. */
  onFire?: () => void;
  /**
   * Called if `onFire` throws. Without this the composable falls back to
   * `console.error` — but a deployed operator never sees `console.error`.
   * Consumers running in a production UI should pass a handler that routes
   * to their real logger/toast/error-boundary.
   *
   * May be async; both synchronous throws and rejected promises returned
   * from the handler are caught and logged alongside the original error,
   * so the cooldown always schedules and the gesture cannot strand in
   * `active`.
   */
  onError?: (err: unknown) => void | Promise<void>;
}

export interface UseHoldGestureReturn {
  // Readonly to enforce that consumers go through start()/cancel()/reset()
  // rather than poking state.value directly and bypassing the timer machine.
  state: Readonly<Ref<HoldGestureState>>;
  start: () => void;
  cancel: () => void;
  reset: () => void;
}

export function useHoldGesture(options: UseHoldGestureOptions = {}): UseHoldGestureReturn {
  const { holdMs = 600, cooldownMs = 2200, onFire, onError } = options;

  const state = ref<HoldGestureState>('idle');
  let armTimer: ReturnType<typeof setTimeout> | null = null;
  let cooldownTimer: ReturnType<typeof setTimeout> | null = null;

  function clearArmTimer() {
    if (armTimer !== null) {
      clearTimeout(armTimer);
      armTimer = null;
    }
  }

  function clearCooldownTimer() {
    if (cooldownTimer !== null) {
      clearTimeout(cooldownTimer);
      cooldownTimer = null;
    }
  }

  // MUST be idempotent: consumers (e.g., AstrosMobileRemote) rely on
  // re-entrant `start()` being a no-op so the synthesized mousedown that
  // browsers emit after a touch sequence absorbs cleanly. A future refactor
  // that weakens the not-idle guard would silently introduce double-fire.
  // See `AstrosMobileRemote.vue`'s `handlePanicDown` comment for the
  // browser-event rationale.
  function start() {
    if (state.value !== 'idle') return;
    state.value = 'arming';
    armTimer = setTimeout(() => {
      armTimer = null;
      state.value = 'active';
      // try/finally so a throwing onFire doesn't strand the gesture in
      // 'active' forever (the cooldown timer must always schedule, otherwise
      // the panic button shows STOPPED indefinitely and the operator has no
      // recovery path). The error is logged for operator visibility — this
      // is NOT silent failure even though we swallow the throw, because
      // (a) the cooldown recovers the gesture, and (b) the consumer's UI
      // already showed the success-side feedback before onFire ran.
      try {
        onFire?.();
      } catch (err) {
        if (onError) {
          // Promise.resolve handles both sync throws (already in catch via
          // the outer try) and async rejections returned from the handler.
          // Without this wrap, an async onError whose promise rejects
          // becomes an unhandled rejection on window.onerror and the
          // original onFire error is lost.
          try {
            Promise.resolve(onError(err)).catch((handlerErr: unknown) => {
              console.error(
                'useHoldGesture: onError handler rejected',
                handlerErr,
                'original:',
                err,
              );
            });
          } catch (handlerErr) {
            console.error('useHoldGesture: onError handler threw', handlerErr, 'original:', err);
          }
        } else {
          console.error('useHoldGesture: onFire callback threw', err);
        }
      } finally {
        cooldownTimer = setTimeout(() => {
          cooldownTimer = null;
          state.value = 'idle';
        }, cooldownMs);
      }
    }, holdMs);
  }

  function cancel() {
    if (state.value !== 'arming') return;
    clearArmTimer();
    state.value = 'idle';
  }

  function reset() {
    clearArmTimer();
    clearCooldownTimer();
    state.value = 'idle';
  }

  onScopeDispose(() => {
    clearArmTimer();
    clearCooldownTimer();
  });

  return { state: readonly(state), start, cancel, reset };
}
