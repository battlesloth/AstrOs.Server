<script setup lang="ts">
import { ref, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { AstrosLayout } from '@/components';

import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';

const { t } = useI18n();

type Phase = 'select' | 'flashing' | 'done' | 'failed';

const phase = ref<Phase>('select');

const subtitle = computed(() => t(`firmware_view.subtitle.${phase.value}`));
</script>

<template>
  <AstrosLayout>
    <template v-slot:main>
      <div
        class="flex flex-col overflow-hidden"
        style="height: calc(100vh - 64px)"
      >
        <div class="flex items-center gap-4 p-4 bg-r2-complement shrink-0 mb-4">
          <h1 class="text-2xl font-bold">{{ $t('firmware_view.title') }}</h1>
        </div>
        <div class="firmware-view firmware-view__content">
          <p class="firmware-view__subtitle">{{ subtitle }}</p>
        </div>
      </div>
    </template>
  </AstrosLayout>
</template>

<style scoped>
.firmware-view__subtitle {
  font-size: 13px;
  color: var(--fw-ink-soft);
  margin: 0;
}

.firmware-view__content {
  flex: 1;
  padding: 20px 24px;
  max-width: 1100px;
  width: 100%;
  margin-inline: auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
  box-sizing: border-box;
}
</style>
