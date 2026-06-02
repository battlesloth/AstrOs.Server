<script lang="ts" setup>
import { ref } from 'vue';

const props = defineProps({
  validatePassword: {
    type: Boolean,
    default: false,
  },
  // Opt-in show/hide toggle (eye icon). Default off preserves the original
  // always-masked behavior for existing callers (e.g. the login form).
  revealable: {
    type: Boolean,
    default: false,
  },
  // Optional overrides so multiple password fields on one form (e.g. current /
  // new / confirm) can have distinct placeholders and accessible names.
  // Empty defaults preserve the original single-field behavior.
  placeholder: {
    type: String,
    default: '',
  },
  ariaLabel: {
    type: String,
    default: '',
  },
  // Forwarded to the inner <input> so an external <label for="..."> can be
  // associated with it (the wrapping label here is daisyUI styling, not a
  // form label). Omitted attribute when empty.
  inputId: {
    type: String,
    default: '',
  },
});

const password = defineModel<string>({
  default: '',
  type: String,
});

defineEmits<{
  (event: 'enter'): void;
}>();

// Local per-field reveal state; resets to masked whenever the field remounts.
const revealed = ref(false);
</script>

<template>
  <div>
    <label :class="['input', 'w-full', { validator: props.validatePassword }]">
      <v-icon
        name="io-key-outline"
        class="opacity-50"
      />
      <input
        v-if="!props.validatePassword"
        :id="props.inputId || undefined"
        v-model="password"
        :type="revealed ? 'text' : 'password'"
        required
        :placeholder="props.placeholder || $t('placeholder.password')"
        :title="props.placeholder || $t('placeholder.password')"
        @keydown.enter="$emit('enter')"
        :aria-label="props.ariaLabel || 'password'"
      />
      <input
        v-if="props.validatePassword"
        :id="props.inputId || undefined"
        v-model="password"
        :type="revealed ? 'text' : 'password'"
        required
        :placeholder="props.placeholder || $t('placeholder.password')"
        minlength="8"
        pattern="(?=.*\d)(?=.*[a-z])(?=.*[A-Z]).{8,}"
        :title="props.placeholder || $t('placeholder.password')"
        @keydown.enter="$emit('enter')"
        :aria-label="props.ariaLabel || 'password'"
      />
      <button
        v-if="props.revealable"
        type="button"
        class="opacity-50 hover:opacity-100 cursor-pointer"
        :aria-label="revealed ? $t('hide_password') : $t('show_password')"
        :aria-pressed="revealed"
        @click="revealed = !revealed"
      >
        <v-icon
          :name="revealed ? 'io-eye-off-outline' : 'io-eye-outline'"
          aria-hidden="true"
        />
      </button>
    </label>
    <p
      class="validator-hint hidden"
      v-if="props.validatePassword"
    >
      {{ $t('error.invalid_password') }}
    </p>
  </div>
</template>
