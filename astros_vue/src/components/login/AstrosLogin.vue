<script lang="ts" setup>
import { AstrosFieldUsername, AstrosFieldPassword } from '@/components/common';

const props = defineProps({
  background: {
    type: String,
    default: '',
  },
  errorMessage: {
    type: String,
    default: '',
  },
});

const credentials = defineModel<{ email: string; password: string }>({
  default: () => ({ email: '', password: '' }),
  type: Object,
});

defineEmits<{
  (event: 'createAccount'): void;
  (event: 'login'): void;
}>();
</script>

<template>
  <div class="relative w-full h-screen bg-gray-200 flex items-center justify-center">
    <img
      v-if="props.background"
      :src="props.background"
      alt="Background Image"
      class="absolute inset-0 w-full h-full object-cover opacity-50"
    />
    <img
      v-else
      src="@/assets/images/r2d2-schematic.jpg"
      alt="Default Background"
      class="absolute inset-0 w-full h-full object-cover opacity-50"
    />

    <!-- The blurred overlay -->
    <div class="absolute inset-0 backdrop-blur-sm flex items-center justify-center">
      <div class="bg-white p-8 rounded-lg shadow-lg w-full max-w-md">
        <div class="flex flex-col items-center justify-center">
          <div class="flex flex-row">
            <h2 class="text-2xl font-bold mb-4">{{ $t('astros') }}</h2>
          </div>
          <AstrosFieldUsername
            class="w-full mb-4"
            v-model="credentials.email"
          />
          <AstrosFieldPassword
            class="w-full mb-4"
            v-model="credentials.password"
            @enter="$emit('login')"
          />
          <div class="flex justify-center w-full mt-4">
            <button
              class="btn btn-secondary w-1/2"
              @click="$emit('login')"
            >
              {{ $t('astrosLogin.login') }}
            </button>
          </div>
          <div
            v-if="props.errorMessage"
            class="mt-4 text-red-600 font-bold text-center"
          >
            {{ $t(props.errorMessage) }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
