<script setup lang="ts">
import { computed, onMounted, ref, watchEffect } from 'vue';
import { useI18n } from 'vue-i18n';
import { storeToRefs } from 'pinia';
import {
  AstrosLayout,
  AstrosFirmwareSourceStrip,
  AstrosFirmwareTopology,
  AstrosFirmwareStagesList,
  AstrosFirmwareControllersPanel,
  AstrosFirmwareConfirmModal,
} from '@/components';
import { useFirmwareStore } from '@/stores/firmware';
import type { FirmwareControllerView, TopologyFleet } from '@/components';

import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';

const { t } = useI18n();
const firmware = useFirmwareStore();
const {
  phase,
  controllers,
  selectedControllerIds,
  target,
  currentStage,
  failedController,
  sourceMode,
  uploadedFilename,
} = storeToRefs(firmware);

const confirmOpen = ref(false);

const subtitle = computed(() => {
  if (phase.value === 'idle') return t('firmware_view.subtitle.select');
  return t(`firmware_view.subtitle.${phase.value}`);
});

const topologyFleet = computed<TopologyFleet | null>(() => {
  const master = controllers.value.find((c) => c.isMaster);
  if (!master) return null;
  return {
    master: { id: master.id, label: master.label },
    padawans: controllers.value
      .filter((c) => !c.isMaster)
      .map((c) => ({ id: c.id, label: c.label })),
  };
});

const selectedControllerList = computed<FirmwareControllerView[]>(() =>
  controllers.value.filter((c) => selectedControllerIds.value.has(c.id)),
);

const failedControllerId = computed(() => failedController.value?.id);

if (import.meta.env.DEV) {
  watchEffect(() => {
    if (controllers.value.length > 0 && !controllers.value.some((c) => c.isMaster)) {
      console.warn(
        '[FirmwareView] no controller is flagged isMaster — topology will not render. ' +
          'Every fleet snapshot must include exactly one master.',
      );
    }
  });
}

function openConfirm() {
  confirmOpen.value = true;
}

function onConfirmCancel() {
  confirmOpen.value = false;
}

async function onConfirmFlash() {
  confirmOpen.value = false;
  await firmware.startFlash();
}

function onResultBarDone() {
  firmware.resetToSelect();
}

const DEV_SAMPLE_FLEET: FirmwareControllerView[] = [
  { id: 'body', label: 'Body', glyph: 'B', current: 'v1.3.0', status: 'up', isMaster: true },
  { id: 'core', label: 'Core', glyph: 'C', current: 'v1.4.0', status: 'up', isMaster: false },
  { id: 'dome', label: 'Dome', glyph: 'D', current: 'v1.4.0', status: 'up', isMaster: false },
];

onMounted(async () => {
  await firmware.fetchReleases();
  // Dev-only placeholder fleet. Replace with the real controllers-store
  // adapter once it exists.
  if (import.meta.env.DEV && firmware.controllers.length === 0) {
    firmware.controllers = DEV_SAMPLE_FLEET;
  }
  if (firmware.controllers.length > 0 && firmware.phase === 'idle') {
    firmware.setPhase('select');
  }
});
</script>

<template>
  <AstrosLayout>
    <template v-slot:main>
      <div
        class="flex flex-col overflow-hidden"
        style="height: calc(100vh - 64px)"
      >
        <div class="flex items-center gap-4 p-4 bg-r2-complement shrink-0 mb-4">
          <h1 class="text-2xl font-bold">{{ t('firmware_view.title') }}</h1>
        </div>
        <div class="firmware-view firmware-view__content">
          <p class="firmware-view__subtitle">{{ subtitle }}</p>

          <AstrosFirmwareSourceStrip v-if="phase === 'select'" />

          <div
            v-if="phase !== 'idle'"
            class="firmware-view__grid"
          >
            <div class="firmware-view__left-column">
              <AstrosFirmwareTopology
                v-if="topologyFleet"
                :fleet="topologyFleet"
                :selected-ids="[...selectedControllerIds]"
                :target="target"
                :phase="phase"
                :failed-controller-id="failedControllerId"
              />
              <AstrosFirmwareStagesList
                v-if="phase === 'flashing' || phase === 'done' || phase === 'failed'"
                :phase="phase"
                :current-stage="currentStage"
                :failed-stage="failedController?.stage ?? null"
              />
            </div>

            <AstrosFirmwareControllersPanel
              class="firmware-view__panel"
              :phase="phase"
              :failed-controller-label="failedController?.label"
              :failed-stage="failedController?.stage"
              @flash="openConfirm"
              @done="onResultBarDone"
            />
          </div>
        </div>
      </div>
    </template>
  </AstrosLayout>

  <AstrosFirmwareConfirmModal
    :open="confirmOpen"
    :target="target"
    :selected-controllers="selectedControllerList"
    :source-mode="sourceMode"
    :uploaded-filename="uploadedFilename"
    @cancel="onConfirmCancel"
    @confirm="onConfirmFlash"
  />
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
  overflow-y: auto;
}

.firmware-view__grid {
  display: grid;
  grid-template-columns: 380px 1fr;
  gap: 16px;
  align-items: start;
}

@media (max-width: 960px) {
  .firmware-view__grid {
    grid-template-columns: 1fr;
  }
}

.firmware-view__left-column {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.firmware-view__panel {
  min-width: 0;
}
</style>
