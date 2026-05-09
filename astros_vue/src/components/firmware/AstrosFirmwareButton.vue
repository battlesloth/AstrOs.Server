<script setup lang="ts">
import type { AstrosFirmwareButtonKind } from './types';

const props = withDefaults(
  defineProps<{
    kind?: AstrosFirmwareButtonKind;
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
    :class="[
      'astros-firmware-button',
      `astros-firmware-button--${props.kind}`,
      { 'astros-firmware-button--full-width': props.fullWidth },
    ]"
  >
    <slot />
  </button>
</template>

<style scoped>
.astros-firmware-button {
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

.astros-firmware-button:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.astros-firmware-button--full-width {
  width: 100%;
}

/* Palette per design handoff README §Buttons. Hex values inline so the
   component is self-contained — no dependency on a `.firmware-view`
   ancestor for var resolution. */
.astros-firmware-button--primary {
  background: #2a5a97; /* primary */
  color: #fff;
  border-color: #2a5a97;
}

.astros-firmware-button--secondary {
  background: #fff;
  color: #0e1726; /* ink */
  border-color: #d6e0e6; /* border */
}

.astros-firmware-button--ghost {
  background: transparent;
  color: #4b5b73; /* inkSoft */
  border-color: transparent;
}

.astros-firmware-button--danger {
  background: #cf4242;
  color: #fff;
  border-color: #cf4242;
}
</style>
