<script setup lang="ts">
import type { FwBtnKind } from './types';

const props = withDefaults(
  defineProps<{
    kind?: FwBtnKind;
    disabled?: boolean;
    fullWidth?: boolean;
    type?: 'button' | 'submit' | 'reset';
  }>(),
  {
    kind: 'primary',
    disabled: false,
    fullWidth: false,
    type: 'button',
  },
);
</script>

<template>
  <button
    :type="props.type"
    :disabled="props.disabled"
    :class="['fw-btn', `fw-btn--${props.kind}`, { 'fw-btn--full-width': props.fullWidth }]"
  >
    <slot />
  </button>
</template>

<style scoped>
.fw-btn {
  padding: 8px 16px;
  border-radius: 4px;
  font-size: 13px;
  font-weight: 600;
  border: 1px solid transparent;
  cursor: pointer;
  font-family: inherit;
  line-height: 1.2;
  transition: background 0.15s linear;
}

.fw-btn:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.fw-btn--full-width {
  width: 100%;
}

/* Palette per design handoff README §Buttons (FwBtn). Hex values inline so
   the component is self-contained — no dependency on a `.firmware-view`
   ancestor for var resolution. */
.fw-btn--primary {
  background: #2a5a97; /* primary */
  color: #fff;
  border-color: #2a5a97;
}

.fw-btn--secondary {
  background: #fff;
  color: #0e1726; /* ink */
  border-color: #d6e0e6; /* border */
}

.fw-btn--ghost {
  background: transparent;
  color: #4b5b73; /* inkSoft */
  border-color: transparent;
}

.fw-btn--danger {
  background: #cf4242;
  color: #fff;
  border-color: #cf4242;
}
</style>
