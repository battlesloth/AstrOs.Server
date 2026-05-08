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
      <main
        class="firmware-view flex flex-col bg-base-200"
        style="height: calc(100vh - 64px)"
      >
        <header class="firmware-view__header bg-r2-xlight">
          <h1 class="firmware-view__title">{{ $t('firmware_view.title') }}</h1>
        </header>
        <div class="firmware-view__content">
          <p class="firmware-view__subtitle">{{ subtitle }}</p>
        </div>
      </main>
    </template>
  </AstrosLayout>
</template>

<style scoped>
.firmware-view__header {
  padding: 14px 20px;
  border-bottom: 1px solid var(--fw-border);
  flex-shrink: 0;
}

.firmware-view__title {
  font-size: 22px;
  font-weight: 700;
  margin: 0;
  color: var(--fw-ink);
}

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
