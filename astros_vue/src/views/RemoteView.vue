<script setup lang="ts">
import AstrosLayout from '@/components/common/layout/AstrosLayout.vue';
import AstrosRemoteControl from '@/components/remoteControl/AstrosRemoteControl.vue';
</script>

<template>
  <AstrosLayout>
    <template v-slot:main>
      <AstrosRemoteControl />
    </template>
  </AstrosLayout>
</template>
