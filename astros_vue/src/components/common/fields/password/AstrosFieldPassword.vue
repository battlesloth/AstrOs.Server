<script lang="ts" setup>
const props = defineProps({
  validatePassword: {
    type: Boolean,
    default: false,
  },
});

const password = defineModel<string>({
  default: '',
  type: String,
});

defineEmits<{
  (event: 'enter'): void;
}>();
</script>

<template>
  <div>
    <label :class="['input', 'w-full', { validator: props.validatePassword }]">
      <v-icon name="io-key-outline" class="opacity-50" />
      <input
        v-if="!props.validatePassword"
        v-model="password"
        type="password"
        required
        :placeholder="$t('placeholder.password')"
        :title="$t('placeholder.password')"
        @keydown.enter="$emit('enter')"
      />
      <input
        v-if="props.validatePassword"
        v-model="password"
        type="password"
        required
        :placeholder="$t('placeholder.password')"
        minlength="8"
        pattern="(?=.*\d)(?=.*[a-z])(?=.*[A-Z]).{8,}"
        :title="$t('placeholder.password')"
        @keydown.enter="$emit('enter')"
      />
    </label>
    <p class="validator-hint hidden" v-if="props.validatePassword">
      {{ $t('error.invalid_password') }}
    </p>
  </div>
</template>
