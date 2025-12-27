<script setup lang="ts">
import AstrosLayout from '@/components/common/layout/AstrosLayout.vue';
import AstrosStatus from '@/components/status/AstrosStatus.vue';
import { useControllerStore } from '@/stores/controller';
import { storeToRefs } from 'pinia';

const controllerStore = useControllerStore();

const bodyStatus = storeToRefs(controllerStore).bodyStatus;
const domeStatus = storeToRefs(controllerStore).domeStatus;
const coreStatus = storeToRefs(controllerStore).coreStatus;

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
