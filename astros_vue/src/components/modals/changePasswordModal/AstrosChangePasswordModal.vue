<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { AstrosFieldPassword } from '@/components/common';
import AstrosWriteButton from '@/components/common/AstrosWriteButton.vue';
import type { ChangePasswordPayload } from './types';

// Length only — no complexity rule by design. Mirrors the server-side guard
// in authentication_controller.ts (MIN_PASSWORD_LENGTH).
const MIN_PASSWORD_LENGTH = 8;

const props = withDefaults(
  defineProps<{
    // i18n key for a server-reported error (e.g. wrong current password). The
    // parent view owns the API call and sets this on failure; client-side
    // validation errors are produced and shown by this component itself.
    errorMessage?: string;
  }>(),
  { errorMessage: '' },
);

const emit = defineEmits<{
  cancel: [];
  accept: [payload: ChangePasswordPayload];
  // Fired when the user edits any field, so the parent can clear a stale
  // server-side error it owns via the errorMessage prop.
  dirty: [];
}>();

const { t } = useI18n();

const oldPassword = ref('');
const newPassword = ref('');
const confirmPassword = ref('');

// Client-side validation message (already translated). Server errors arrive
// via the errorMessage prop as an i18n key.
const validationError = ref('');

// Clear a stale error as soon as the user edits any field — the local
// client-side error directly, and the server-side error via the parent.
watch([oldPassword, newPassword, confirmPassword], () => {
  validationError.value = '';
  emit('dirty');
});

const displayError = computed(
  () => validationError.value || (props.errorMessage ? t(props.errorMessage) : ''),
);

function onAccept() {
  if (!oldPassword.value) {
    validationError.value = t('utility_view.current_password_required');
    return;
  }
  if (newPassword.value.length < MIN_PASSWORD_LENGTH) {
    validationError.value = t('utility_view.password_too_short');
    return;
  }
  if (newPassword.value !== confirmPassword.value) {
    validationError.value = t('utility_view.password_mismatch');
    return;
  }

  emit('accept', { oldPassword: oldPassword.value, newPassword: newPassword.value });
}
</script>

<template>
  <dialog class="modal modal-open">
    <div class="modal-box w-100 max-w-md">
      <h1 class="text-2xl font-bold mb-4">
        {{ $t('utility_view.change_password_modal_title') }}
      </h1>

      <div class="mb-4">
        <label
          for="change-password-current"
          class="block mb-1 font-semibold"
        >
          {{ $t('utility_view.current_password') }}
        </label>
        <AstrosFieldPassword
          v-model="oldPassword"
          input-id="change-password-current"
          :aria-label="$t('utility_view.current_password')"
          :placeholder="$t('utility_view.current_password')"
          @enter="onAccept"
        />
      </div>

      <div class="mb-4">
        <label
          for="change-password-new"
          class="block mb-1 font-semibold"
        >
          {{ $t('utility_view.new_password') }}
        </label>
        <AstrosFieldPassword
          v-model="newPassword"
          input-id="change-password-new"
          :aria-label="$t('utility_view.new_password')"
          :placeholder="$t('utility_view.new_password')"
          @enter="onAccept"
        />
        <p class="text-sm opacity-70 mt-1">{{ $t('utility_view.password_hint') }}</p>
      </div>

      <div class="mb-2">
        <label
          for="change-password-confirm"
          class="block mb-1 font-semibold"
        >
          {{ $t('utility_view.confirm_password') }}
        </label>
        <AstrosFieldPassword
          v-model="confirmPassword"
          input-id="change-password-confirm"
          :aria-label="$t('utility_view.confirm_password')"
          :placeholder="$t('utility_view.confirm_password')"
          @enter="onAccept"
        />
      </div>

      <p
        v-if="displayError"
        class="text-error font-bold text-center mt-2"
        role="alert"
        data-testid="change-password-error"
      >
        {{ displayError }}
      </p>

      <div class="modal-action justify-center mt-5">
        <AstrosWriteButton
          class="btn btn-primary w-28 text-lg"
          data-testid="change-password-accept"
          @click="onAccept"
        >
          {{ $t('accept') }}
        </AstrosWriteButton>
        <button
          type="button"
          class="btn w-28 text-lg"
          data-testid="change-password-cancel"
          @click="emit('cancel')"
        >
          {{ $t('cancel') }}
        </button>
      </div>
    </div>
    <form
      method="dialog"
      class="modal-backdrop"
      @click="emit('cancel')"
    >
      <button>{{ $t('cancel') }}</button>
    </form>
  </dialog>
</template>
