<script setup lang="ts">
import { RouterView } from 'vue-router'
</script>
<template>
  <router-view v-slot="{ Component }">
    <suspense timeout="0">
      <template #default>
        <component :is="Component" :key="$route.path"></component>
      </template>
      <template #fallback>
        <div>Loading...</div>
      </template>
    </suspense>
  </router-view>
</template>

<style scoped></style>
