<script setup lang="ts">
import apiService from '@/api/apiService';
import { LOGIN } from '@/api/endpoints';
import { AstrosLogin } from '@/components/index';
import router from '@/router';
import { ref } from 'vue';

const errorMessage = ref('');

const credentials = defineModel<{ email: string; password: string }>({
  default: () => ({ email: '', password: '' }),
  type: Object,
});

function login() {
  // Logic to handle login
  apiService
    .post(LOGIN, {
      username: credentials.value.email,
      password: credentials.value.password,
    })
    .then((response) => {
      console.log('Login successful', response);
      // Store the JWT token
      if (response.token) {
        apiService.setToken(response.token);
        router.push('/');
      } else {
        errorMessage.value = 'error.invalid_response';
      }
    })
    .catch((error) => {
      console.error('Login failed', error);
      errorMessage.value = 'error.invalid_credentials';
    });
  console.log('Login clicked', credentials.value);
}
</script>

<template>
  <main>
    <AstrosLogin
      v-model="credentials"
      @login="login"
      :errorMessage="errorMessage"
    />
  </main>
</template>
