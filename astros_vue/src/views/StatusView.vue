<script setup lang="ts">
import AstrosLayout from '@/components/common/layout/AstrosLayout.vue';
import AstrosStatus from '@/components/status/AstrosStatus.vue';
import { ControllerStatus } from '@/enums/controllerStatus';
</script>

<template>
  <AstrosLayout>
    <template v-slot:main>
      <div class="h-full justify-center items-center flex flex-col">
        <AstrosStatus
          :bodyStatus="ControllerStatus.DOWN"
          :domeStatus="ControllerStatus.UP"
          :coreStatus="ControllerStatus.UP"
        />
      </div>
    </template>
  </AstrosLayout>
</template>
