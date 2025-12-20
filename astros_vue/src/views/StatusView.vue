<script setup lang="ts">
import AstrosLayout from '@/components/common/layout/AstrosLayout.vue';
import AstrosStatus from '@/components/status/AstrosStatus.vue';
import { useControllerStore } from '@/stores/controller';
import { computed } from 'vue';

const controllerStore = useControllerStore();

const bodyStatus = computed(() => controllerStore.bodyStatus);
const domeStatus = computed(() => controllerStore.domeStatus);
const coreStatus = computed(() => controllerStore.coreStatus);

</script>


<template>
  <AstrosLayout>
    <template v-slot:main>
      <div class="h-full justify-center items-center flex flex-col">
        <AstrosStatus :bodyStatus="bodyStatus" :domeStatus="domeStatus" :coreStatus="coreStatus" />
      </div>
    </template>
  </AstrosLayout>
</template>
