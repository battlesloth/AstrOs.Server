<script setup lang="ts">
import AstrosLayout from '@/components/common/layout/AstrosLayout.vue';
import AstrosPixiView from '@/components/scripter/AstrosPixiView.vue';


</script>

<template>
  <AstrosLayout>
    <template v-slot:main>
      <AstrosPixiView />
    </template>
  </AstrosLayout>
</template>
