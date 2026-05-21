import { ref, onScopeDispose, type Ref } from 'vue';

export type HoldGestureState = 'idle' | 'arming' | 'active';

export interface UseHoldGestureOptions {
  /** How long the user must hold before the gesture fires. Default 600ms. */
  holdMs?: number;
  /** How long the gesture stays in the `active` lockout after firing. Default 2200ms. */
  cooldownMs?: number;
  /** Called once when the gesture transitions from `arming` to `active`. */
  onFire?: () => void;
}

export interface UseHoldGestureReturn {
  state: Ref<HoldGestureState>;
  start: () => void;
  cancel: () => void;
  reset: () => void;
}

// Refined from the plan's 4-state model (idle | arming | active | cooldown):
// in the actual design, "active" IS the cooldown — the button shows STOPPED
// for the entire lockout window and resets to idle when it expires. There's
// no observable difference between an `active` and a separate `cooldown`
// state, so the simpler 3-state machine is equivalent.
export function useHoldGesture(options: UseHoldGestureOptions = {}): UseHoldGestureReturn {
  const { holdMs = 600, cooldownMs = 2200, onFire } = options;

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

  function start() {
    if (state.value !== 'idle') return;
    state.value = 'arming';
    armTimer = setTimeout(() => {
      armTimer = null;
      state.value = 'active';
      onFire?.();
      cooldownTimer = setTimeout(() => {
        cooldownTimer = null;
        state.value = 'idle';
      }, cooldownMs);
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

  return { state, start, cancel, reset };
}
