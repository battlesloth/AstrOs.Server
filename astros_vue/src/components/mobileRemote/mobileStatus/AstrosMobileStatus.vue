<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import AstrosStatus from '@/components/status/AstrosStatus.vue';
import { ControllerStatus } from '@/enums';

const props = defineProps<{
  domeStatus: ControllerStatus;
  coreStatus: ControllerStatus;
  bodyStatus: ControllerStatus;
}>();

const emit = defineEmits<{ logout: [] }>();

const { t } = useI18n();

const STATUS_COLOR: Record<ControllerStatus, string> = {
  [ControllerStatus.UP]: '#3aa676',
  [ControllerStatus.NEEDS_SYNCED]: '#e0a800',
  [ControllerStatus.FIRMWARE_INCOMPATIBLE]: '#c91f1f',
  [ControllerStatus.DOWN]: '#9bb1bd',
};

function statusText(status: ControllerStatus): string {
  return t(`mobile.location_status.${status}`);
}

// Render order matches the droid silhouette top-to-bottom: dome, core, body.
const locations = [
  { key: 'dome', label: () => t('mobile.location.dome'), status: () => props.domeStatus },
  { key: 'core', label: () => t('mobile.location.core'), status: () => props.coreStatus },
  { key: 'body', label: () => t('mobile.location.body'), status: () => props.bodyStatus },
];
</script>

<template>
  <section
    class="astros-mobile-status"
    role="region"
    :aria-label="$t('mobile.status_heading')"
  >
    <h2 class="astros-mobile-status__heading">{{ $t('mobile.status_heading') }}</h2>

    <div class="astros-mobile-status__droid">
      <AstrosStatus
        :body-status="bodyStatus"
        :dome-status="domeStatus"
        :core-status="coreStatus"
      />
    </div>

    <ul class="astros-mobile-status__legend">
      <li
        v-for="loc in locations"
        :key="loc.key"
        class="astros-mobile-status__legend-item"
      >
        <span
          class="astros-mobile-status__legend-dot"
          :style="{ background: STATUS_COLOR[loc.status()] }"
          aria-hidden="true"
        ></span>
        <span class="astros-mobile-status__legend-name">{{ loc.label() }}</span>
        <span class="astros-mobile-status__legend-status">{{ statusText(loc.status()) }}</span>
      </li>
    </ul>

    <button
      type="button"
      class="astros-mobile-status__logout"
      @click="emit('logout')"
    >
      {{ $t('nav.logout') }}
    </button>
  </section>
</template>

<style scoped>
/* Inherits the --mr-* palette from the mobile shell; fallbacks match the
 * AstrosMobileRemote "Direction B" tokens for standalone/Storybook use. */
.astros-mobile-status {
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: center;
  gap: 18px;
  padding: 20px 18px;
  overflow-y: auto;
  background: var(--mr-base-200, #f2f7fa);
  color: var(--mr-ink, #0e1726);
  font-family: 'Inter', system-ui, sans-serif;
}

.astros-mobile-status__heading {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
  letter-spacing: 0.02em;
}

.astros-mobile-status__droid {
  display: flex;
  justify-content: center;
  width: 100%;
}

.astros-mobile-status__legend {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
  max-width: 320px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.astros-mobile-status__legend-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  border: 1px solid var(--mr-border, #d6e0e6);
  border-radius: 12px;
  background: var(--mr-base-100, #ffffff);
  font-size: 13px;
}

.astros-mobile-status__legend-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
}

.astros-mobile-status__legend-name {
  font-weight: 700;
}

.astros-mobile-status__legend-status {
  margin-left: auto;
  color: var(--mr-ink-soft, #4b5b73);
  font-weight: 600;
}

.astros-mobile-status__logout {
  margin-top: auto;
  padding: 12px 22px;
  border: 1px solid var(--mr-border-strong, #9bb1bd);
  border-radius: 14px;
  background: var(--mr-base-100, #ffffff);
  color: var(--mr-ink, #0e1726);
  font-family: inherit;
  font-size: 14px;
  font-weight: 700;
  letter-spacing: 0.04em;
  cursor: pointer;
  transition: transform 80ms;
}
.astros-mobile-status__logout:active {
  transform: scale(0.97);
}
</style>
