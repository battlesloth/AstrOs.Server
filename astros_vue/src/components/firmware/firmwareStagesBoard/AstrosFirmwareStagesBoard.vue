<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import AstrosFirmwareStageColumn from '../firmwareStageColumn/AstrosFirmwareStageColumn.vue';
import type { StageColumnModel } from '@/utils/firmwareStageBoard';

defineProps<{ columns: StageColumnModel[] }>();
const { t } = useI18n();
</script>

<template>
  <section
    class="astros-firmware-stages-board"
    :aria-label="t('firmware_view.stages.eyebrow_title')"
  >
    <header class="astros-firmware-stages-board__header">
      <span class="astros-firmware-stages-board__eyebrow">{{
        t('firmware_view.stages.eyebrow_title')
      }}</span>
    </header>
    <div class="astros-firmware-stages-board__grid">
      <AstrosFirmwareStageColumn
        v-for="col in columns"
        :key="col.id"
        :column="col"
      />
    </div>
  </section>
</template>

<style scoped>
.astros-firmware-stages-board {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.astros-firmware-stages-board__header {
  padding: 2px 2px;
}

.astros-firmware-stages-board__eyebrow {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #4b5b73;
}

.astros-firmware-stages-board__grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(0, 1fr));
  gap: 16px;
}

@media (max-width: 720px) {
  .astros-firmware-stages-board__grid {
    grid-template-columns: 1fr;
  }
}
</style>
