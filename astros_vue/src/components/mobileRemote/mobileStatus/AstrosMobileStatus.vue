<script setup lang="ts">
import AstrosStatus from '@/components/status/AstrosStatus.vue';
import { ControllerStatus } from '@/enums';

defineProps<{
  domeStatus: ControllerStatus;
  coreStatus: ControllerStatus;
  bodyStatus: ControllerStatus;
}>();

const emit = defineEmits<{ logout: [] }>();
</script>

<template>
  <section
    class="astros-mobile-status"
    role="region"
    :aria-label="$t('mobile.status_heading')"
  >
    <div class="astros-mobile-status__droid">
      <AstrosStatus
        :body-status="bodyStatus"
        :dome-status="domeStatus"
        :core-status="coreStatus"
      />
    </div>

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
  gap: 16px;
  padding: 20px 18px;
  /* No scroll — the droid scales down to keep the logout button in view. */
  overflow: hidden;
  background: var(--mr-base-200, #f2f7fa);
  color: var(--mr-ink, #0e1726);
  font-family: 'Inter', system-ui, sans-serif;
}

/* The droid fills the space above the logout button and scales to fit it.
 * AstrosStatus stacks a base image plus absolute-positioned status overlays;
 * making its root (the only child div) the relative, height-bounded centering
 * box lets the base and overlays scale together (both capped by this height). */
.astros-mobile-status__droid {
  display: flex;
  flex: 1;
  min-height: 0;
  width: 100%;
  justify-content: center;
}
.astros-mobile-status__droid :deep(div) {
  position: relative;
  display: flex;
  flex: 1;
  min-height: 0;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}
.astros-mobile-status__droid :deep(img) {
  max-width: 100%;
  max-height: 100%;
}

.astros-mobile-status__logout {
  flex-shrink: 0;
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
