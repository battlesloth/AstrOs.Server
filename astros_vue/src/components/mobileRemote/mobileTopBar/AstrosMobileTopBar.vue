<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

type MobileScreen = 'remote' | 'status';

const props = defineProps<{
  // Server/WebSocket reachability. Drives the button color (green/red), not
  // droid health — see the design decision in the plan.
  connected: boolean;
  // Which screen is showing. Determines the button label + tap intent: on
  // 'remote' the button reads the connection status and opens 'status'; on
  // 'status' it reads "Remote" and returns.
  screen: MobileScreen;
}>();

const emit = defineEmits<{ toggle: [] }>();

const { t } = useI18n();

const label = computed(() => {
  if (props.screen === 'status') return t('mobile.remote');
  return props.connected ? t('mobile.connected') : t('mobile.offline');
});

// Spoken intent differs from the visible label so screen-reader users learn
// both the connection state AND what tapping does.
const ariaLabel = computed(() => {
  if (props.screen === 'status') return t('mobile.toggle_to_remote_aria');
  return props.connected
    ? t('mobile.toggle_to_status_connected_aria')
    : t('mobile.toggle_to_status_offline_aria');
});
</script>

<template>
  <header class="astros-mobile-top-bar">
    <span
      class="astros-mobile-top-bar__wordmark font-starwars"
      :aria-label="$t('astros')"
    >
      <span class="astros-mobile-top-bar__wordmark-cap">A</span>str<span
        class="astros-mobile-top-bar__wordmark-cap"
        >O</span
      >s
    </span>

    <button
      type="button"
      class="astros-mobile-top-bar__toggle"
      :class="{
        'astros-mobile-top-bar__toggle--connected': connected,
        'astros-mobile-top-bar__toggle--offline': !connected,
      }"
      :aria-label="ariaLabel"
      @click="emit('toggle')"
    >
      <span
        class="astros-mobile-top-bar__dot"
        aria-hidden="true"
      ></span>
      <span class="astros-mobile-top-bar__toggle-label">{{ label }}</span>
      <span
        class="astros-mobile-top-bar__chevron"
        aria-hidden="true"
        >{{ screen === 'status' ? '‹' : '›' }}</span
      >
    </button>
  </header>
</template>

<style scoped>
/* Inherits the --mr-* palette from the mobile shell; standalone fallbacks
 * (Storybook) match the AstrosMobileRemote "Direction B" tokens. */
.astros-mobile-top-bar {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 14px 18px;
  background: var(--mr-complement, #f49446);
  color: #000;
}

.astros-mobile-top-bar__wordmark {
  font-size: 22px;
  line-height: 1;
  letter-spacing: 0.02em;
}

.astros-mobile-top-bar__wordmark-cap {
  font-size: 1.25em;
}

.astros-mobile-top-bar__toggle {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 7px 12px;
  border: none;
  border-radius: 999px;
  color: #ffffff;
  font-family: inherit;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.04em;
  cursor: pointer;
  transition:
    background 120ms,
    transform 80ms;
  box-shadow: 0 1px 0 rgba(0, 0, 0, 0.18);
}
.astros-mobile-top-bar__toggle:active {
  transform: scale(0.96);
}

.astros-mobile-top-bar__toggle--connected {
  background: var(--mr-success, #3aa676);
}
.astros-mobile-top-bar__toggle--offline {
  background: var(--mr-panic-idle, #c91f1f);
}

.astros-mobile-top-bar__dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #ffffff;
}

.astros-mobile-top-bar__chevron {
  font-size: 15px;
  line-height: 1;
  opacity: 0.85;
}
</style>
