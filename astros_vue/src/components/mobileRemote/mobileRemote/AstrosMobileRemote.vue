<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch, type PropType } from 'vue';
import { useI18n } from 'vue-i18n';
import type { RemoteControlPage } from '@/models/remoteControl/remoteControlPage';
import { BUTTON_KEYS } from '@/models/remoteControl/remoteControlPage';
import type { PageButton } from '@/models/remoteControl/pageButton';
import { useHoldGesture } from '@/composables/useHoldGesture';
import { useSwipeGesture } from '@/composables/useSwipeGesture';
import type { AstrosMobileRemotePressEvent } from './types';

const props = defineProps({
  pages: {
    type: Array as PropType<RemoteControlPage[]>,
    required: true,
  },
  initialIdx: {
    type: Number,
    default: 0,
  },
  compact: {
    type: Boolean,
    default: false,
  },
  // Phase 4 will drive this from the WebSocket connection store. Default to
  // `true` so the standalone-component case (and Storybook) renders the
  // intended "Connected" chip.
  connected: {
    type: Boolean,
    default: true,
  },
});

const emit = defineEmits<{
  press: [event: AstrosMobileRemotePressEvent];
  panic: [];
}>();

const { t } = useI18n();

const idx = ref(props.initialIdx);
// Keep idx in sync if the parent reseats initialIdx (mirrors the React
// useEffect in mobileRemote.jsx). Important for Phase 2's preview rail
// where the editor switches selected page.
watch(
  () => props.initialIdx,
  (next) => {
    if (next >= 0 && next < props.pages.length) {
      idx.value = next;
    }
  },
);

// Clamp idx when pages shrinks below the current index — otherwise the
// component falls into the empty-state branch even though there are still
// valid pages (e.g., parent deletes pages without updating initialIdx).
watch(
  () => props.pages.length,
  (newLen) => {
    if (newLen === 0) {
      idx.value = 0;
      return;
    }
    if (idx.value >= newLen) idx.value = newLen - 1;
  },
);

const pressedButtonId = ref<string | null>(null);
const toastMessage = ref<string | null>(null);

let pressClearTimer: ReturnType<typeof setTimeout> | null = null;
let toastClearTimer: ReturnType<typeof setTimeout> | null = null;
let panicToastTimer: ReturnType<typeof setTimeout> | null = null;

function clearPressTimer() {
  if (pressClearTimer !== null) {
    clearTimeout(pressClearTimer);
    pressClearTimer = null;
  }
}

function clearToastTimer() {
  if (toastClearTimer !== null) {
    clearTimeout(toastClearTimer);
    toastClearTimer = null;
  }
}

function clearPanicToastTimer() {
  if (panicToastTimer !== null) {
    clearTimeout(panicToastTimer);
    panicToastTimer = null;
  }
}

const panic = useHoldGesture({
  holdMs: 600,
  cooldownMs: 2200,
  onFire: () => {
    // Cancel any in-flight press toast so it doesn't clear the panic toast
    // partway through. The reverse direction (press during active) is
    // blocked by the state guard in handlePress.
    clearToastTimer();
    clearPanicToastTimer();
    toastMessage.value = t('mobile_remote.panic_toast');
    panicToastTimer = setTimeout(() => {
      toastMessage.value = null;
      panicToastTimer = null;
    }, 1800);
    // Phase 4 contract: the parent must gate on delivery confirmation before
    // letting the operator trust the STOPPED visual. The component shows
    // success-side feedback unconditionally; Phase 4 must override (e.g., set
    // a panicStatus prop or emit an error event) if the WS panic message
    // fails to send. See plan's "Phase 4 contract requirements" section.
    emit('panic');
  },
});

// Defensive clamp at read-time so initial-mount or mid-prop-update windows
// (where idx is set but the matching watcher hasn't yet fired) don't surface
// the empty-state branch when valid pages exist. The clamp also covers the
// out-of-range initialIdx case at construction (the watchers below clamp on
// changes but not on the initial value).
const currentPage = computed<RemoteControlPage | null>(() => {
  if (props.pages.length === 0) return null;
  const safeIdx = Math.min(Math.max(0, idx.value), props.pages.length - 1);
  return props.pages[safeIdx] ?? null;
});
const totalPages = computed(() => props.pages.length);

// BUTTON_KEYS is the canonical 1..9 ordering shared with the backend; iterating
// it once into a slots array means each template binding reads one variable
// instead of re-calling a function per attribute expression.
const slots = computed(() => {
  const page = currentPage.value;
  if (page === null) return [];
  return BUTTON_KEYS.map((key) => page[key]);
});

function handlePress(button: PageButton) {
  if (button.type === 'none') return;
  // 'arming' is NOT blocked here: the user may change their mind mid-hold
  // and the 600ms window is short enough that "two-handed" presses aren't
  // a real failure mode. Only the committed 'active' lockout (the 2.2s
  // post-fire window) suppresses presses. Matches the handoff JSX.
  if (panic.state.value === 'active') return;

  pressedButtonId.value = button.id;
  toastMessage.value = t('mobile_remote.press_toast', { name: button.name });

  clearPressTimer();
  pressClearTimer = setTimeout(() => {
    pressedButtonId.value = null;
    pressClearTimer = null;
  }, 220);

  clearToastTimer();
  toastClearTimer = setTimeout(() => {
    toastMessage.value = null;
    toastClearTimer = null;
  }, 1600);

  // Type narrowed by the `button.type === 'none'` early-return above; the
  // emit's typed payload (AstrosMobileRemotePressEvent = FilledPageButton)
  // excludes 'none' so the parent gets a script-or-playlist discriminator.
  emit('press', button as AstrosMobileRemotePressEvent);
}

function goPrev() {
  if (idx.value > 0) idx.value -= 1;
}

function goNext() {
  if (idx.value < totalPages.value - 1) idx.value += 1;
}

function selectPage(target: number) {
  if (target >= 0 && target < totalPages.value) idx.value = target;
}

// Swipe-to-paginate on the 3x3 grid surface (composable encapsulates the
// distance threshold, vertical-max guard, multi-touch abort, and the
// preventDefault that suppresses synthesized clicks on swipe). Direction
// convention matches iOS Photos / Twitter / Instagram: the content moves
// opposite the finger, so swipe LEFT → next page, swipe RIGHT → previous.
const swipe = useSwipeGesture({
  horizontalThresholdPx: 60,
  verticalMaxPx: 40,
  onSwipeLeft: () => goNext(),
  onSwipeRight: () => goPrev(),
});

function handlePanicDown(event: Event) {
  // The preventDefault on touchstart is a Vue 3 passive-listener no-op in
  // most builds, so the synthesized mousedown still fires and reaches this
  // handler a second time. The safety net is useHoldGesture.start()'s own
  // idempotency: it returns early when state !== 'idle', so the duplicate
  // call is benign. A future composable refactor that breaks idempotency
  // would expose this — re-evaluate then.
  if (event.type === 'touchstart') event.preventDefault();
  panic.start();
}

function handlePanicUp(event: Event) {
  if (event.type === 'touchend') event.preventDefault();
  panic.cancel();
}

onBeforeUnmount(() => {
  clearPressTimer();
  clearToastTimer();
  clearPanicToastTimer();
  // The useHoldGesture composable cleans up its own timers via onScopeDispose.
});

const stopAllLabel = computed(() => {
  if (panic.state.value === 'active') return t('mobile_remote.stop_all_active');
  if (panic.state.value === 'arming') return t('mobile_remote.stop_all_arming');
  return t('mobile_remote.stop_all_idle');
});
</script>

<template>
  <div
    class="astros-mobile-remote"
    :class="{ 'astros-mobile-remote--compact': compact }"
    role="region"
    :aria-label="$t('mobile_remote.region_label')"
  >
    <!-- Top bar -->
    <div class="astros-mobile-remote__top-bar">
      <span
        class="astros-mobile-remote__wordmark font-starwars"
        aria-label="AstrOs"
      >
        <span class="astros-mobile-remote__wordmark-cap">A</span>str<span
          class="astros-mobile-remote__wordmark-cap"
          >O</span
        >s
      </span>
      <span
        v-if="connected"
        class="astros-mobile-remote__connection"
      >
        <span
          class="astros-mobile-remote__connection-dot"
          aria-hidden="true"
        ></span>
        {{ $t('mobile_remote.connected_label') }}
      </span>
    </div>

    <!-- Page header -->
    <div
      v-if="currentPage"
      class="astros-mobile-remote__page-header"
    >
      <span class="astros-mobile-remote__page-name">{{ currentPage.name }}</span>
      <span class="astros-mobile-remote__page-pagination"> {{ idx + 1 }} / {{ totalPages }} </span>
    </div>
    <div
      v-else
      class="astros-mobile-remote__empty-state"
      role="status"
    >
      {{ $t('mobile_remote.no_pages') }}
    </div>

    <!-- 3x3 grid -->
    <div
      v-if="currentPage"
      class="astros-mobile-remote__grid"
      @touchstart="swipe.onTouchStart"
      @touchend="swipe.onTouchEnd"
      @touchcancel="swipe.onTouchCancel"
    >
      <button
        v-for="(button, i) in slots"
        :key="i"
        type="button"
        class="astros-mobile-remote__slot"
        :class="{
          'astros-mobile-remote__slot--filled': button.type !== 'none',
          'astros-mobile-remote__slot--pressed':
            button.type !== 'none' && pressedButtonId === button.id,
        }"
        :disabled="button.type === 'none'"
        :aria-label="
          button.type === 'none'
            ? $t('mobile_remote.empty_slot_aria', { number: i + 1 })
            : button.name
        "
        @click="handlePress(button)"
      >
        <span
          v-if="button.type !== 'none'"
          class="astros-mobile-remote__chip"
          :class="`astros-mobile-remote__chip--${button.type}`"
        >
          <v-icon
            :name="button.type === 'script' ? 'md-description' : 'md-folder'"
            class="astros-mobile-remote__chip-icon"
            aria-hidden="true"
          />
          {{
            button.type === 'script'
              ? $t('mobile_remote.chip_script')
              : $t('mobile_remote.chip_playlist')
          }}
        </span>
        <span class="astros-mobile-remote__slot-label">
          {{ button.type !== 'none' ? button.name : '—' }}
        </span>
      </button>
    </div>

    <!-- Pagination row -->
    <div class="astros-mobile-remote__pagination">
      <button
        type="button"
        class="astros-mobile-remote__page-nav"
        :disabled="idx === 0"
        :aria-label="$t('mobile_remote.prev_page_aria')"
        @click="goPrev"
      >
        ‹
      </button>
      <div class="astros-mobile-remote__dots">
        <button
          v-for="(page, i) in pages"
          :key="page.id"
          type="button"
          class="astros-mobile-remote__dot"
          :class="{ 'astros-mobile-remote__dot--active': i === idx }"
          :aria-label="$t('mobile_remote.dot_aria', { number: i + 1 })"
          :aria-current="i === idx ? 'page' : undefined"
          @click="selectPage(i)"
        ></button>
      </div>
      <button
        type="button"
        class="astros-mobile-remote__page-nav"
        :disabled="idx === totalPages - 1"
        :aria-label="$t('mobile_remote.next_page_aria')"
        @click="goNext"
      >
        ›
      </button>
    </div>

    <!-- Toast -->
    <div
      v-if="toastMessage"
      class="astros-mobile-remote__toast"
      role="status"
      aria-live="polite"
    >
      {{ toastMessage }}
    </div>

    <!-- Panic / Stop All -->
    <div class="astros-mobile-remote__panic-wrap">
      <button
        type="button"
        class="astros-mobile-remote__panic"
        :class="{
          'astros-mobile-remote__panic--arming': panic.state.value === 'arming',
          'astros-mobile-remote__panic--active': panic.state.value === 'active',
        }"
        :aria-pressed="panic.state.value === 'active'"
        @mousedown="handlePanicDown"
        @mouseup="handlePanicUp"
        @mouseleave="handlePanicUp"
        @touchstart="handlePanicDown"
        @touchend="handlePanicUp"
        @touchcancel="handlePanicUp"
      >
        <!-- Arming fill -->
        <span
          class="astros-mobile-remote__panic-fill"
          :class="{
            'astros-mobile-remote__panic-fill--arming': panic.state.value === 'arming',
          }"
          aria-hidden="true"
        ></span>
        <span class="astros-mobile-remote__panic-label">
          <span
            class="astros-mobile-remote__panic-glyph"
            aria-hidden="true"
          ></span>
          {{ stopAllLabel }}
        </span>
      </button>
      <div class="astros-mobile-remote__panic-caption">
        {{ $t('mobile_remote.stop_all_caption') }}
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Design tokens scoped to the mobile remote — values from the Direction B
 * handoff (`.tmp/design_handoff_remote_control/`). Kept local rather than
 * promoted to `assets/styles.css` because they are mobile-remote-specific
 * accents (panic red, toast slate) and not part of the broader app palette. */
.astros-mobile-remote {
  --mr-primary: #2a5a97;
  --mr-primary-hover: #2f445c;
  --mr-complement: #f49446;
  --mr-base-100: #ffffff;
  --mr-base-200: #f2f7fa;
  --mr-ink: #0e1726;
  --mr-ink-soft: #4b5b73;
  --mr-border: #d6e0e6;
  --mr-border-strong: #9bb1bd;
  --mr-success: #3aa676;
  --mr-panic-idle: #c91f1f;
  --mr-panic-active: #7a1717;
  --mr-toast-bg: rgba(14, 23, 38, 0.92);

  position: relative;
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  background: var(--mr-base-100);
  color: var(--mr-ink);
  font-family: 'Inter', system-ui, sans-serif;
}

/* === TOP BAR === */
.astros-mobile-remote__top-bar {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: 8px;
  padding: 14px 18px;
  background: var(--mr-complement);
  color: #000;
}
.astros-mobile-remote--compact .astros-mobile-remote__top-bar {
  padding: 8px 10px;
}

.astros-mobile-remote__wordmark {
  font-size: 22px;
  letter-spacing: 0.02em;
  /* Per-letter line-height tightens to keep the larger caps from stretching
   * the top bar height when the size factor scales above 1.2. */
  line-height: 1;
}
.astros-mobile-remote--compact .astros-mobile-remote__wordmark {
  font-size: 14px;
}

/* Capital A and O scale up to enforce the "AstrOs" branding rhythm — the
 * proprietary wordmark renders the caps as larger glyphs and this approximates
 * that until the real woff replaces distant_galaxyregular. Uses em (not px)
 * so the compact and full sizes both scale proportionally. */
.astros-mobile-remote__wordmark-cap {
  font-size: 1.25em;
}

.astros-mobile-remote__connection {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  margin-left: auto;
  font-size: 11px;
  font-weight: 600;
}
.astros-mobile-remote--compact .astros-mobile-remote__connection {
  font-size: 9px;
}

.astros-mobile-remote__connection-dot {
  display: inline-block;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--mr-success);
}

/* === PAGE HEADER === */
.astros-mobile-remote__page-header {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: space-between;
  padding: 14px 18px 8px;
}
.astros-mobile-remote--compact .astros-mobile-remote__page-header {
  padding: 8px 10px 4px;
}

.astros-mobile-remote__page-name {
  font-size: 14px;
  font-weight: 700;
}
.astros-mobile-remote--compact .astros-mobile-remote__page-name {
  font-size: 11px;
}

.astros-mobile-remote__page-pagination {
  font-size: 11px;
  color: var(--mr-ink-soft);
}
.astros-mobile-remote--compact .astros-mobile-remote__page-pagination {
  font-size: 9px;
}

.astros-mobile-remote__empty-state {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  color: var(--mr-ink-soft);
  font-size: 13px;
  text-align: center;
}

/* === 3x3 GRID === */
.astros-mobile-remote__grid {
  flex: 1;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  grid-template-rows: repeat(3, 1fr);
  gap: 10px;
  padding: 16px;
  padding-top: 4px;
}
.astros-mobile-remote--compact .astros-mobile-remote__grid {
  gap: 6px;
  padding: 8px;
  padding-top: 4px;
}

.astros-mobile-remote__slot {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 12px 10px;
  border: 1.5px dashed var(--mr-border-strong);
  border-radius: 18px;
  background: var(--mr-base-200);
  color: var(--mr-ink-soft);
  font-family: inherit;
  /* Reduced from the handoff's 18px / 12px to accommodate longer script and
   * playlist titles before the 3-line clamp truncates. Bold (700) keeps the
   * labels readable at arm's length on the handheld remote. */
  font-size: 15px;
  font-weight: 700;
  line-height: 1.15;
  cursor: default;
  transition: all 100ms;
  transform: scale(1);
}
.astros-mobile-remote--compact .astros-mobile-remote__slot {
  gap: 3px;
  padding: 6px;
  border-radius: 12px;
  font-size: 11px;
}

.astros-mobile-remote__slot--filled {
  border: none;
  background: var(--mr-primary);
  color: #ffffff;
  cursor: pointer;
  box-shadow:
    0 2px 0 rgba(0, 0, 0, 0.15),
    0 4px 12px rgba(42, 90, 151, 0.25);
}

.astros-mobile-remote__slot--pressed {
  background: var(--mr-primary-hover);
  transform: scale(0.96);
  box-shadow: none;
}

.astros-mobile-remote__slot[disabled] {
  cursor: default;
}

.astros-mobile-remote__slot-label {
  display: -webkit-box;
  overflow: hidden;
  padding-top: 10px;
  text-align: center;
  word-break: break-word;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
}
.astros-mobile-remote--compact .astros-mobile-remote__slot-label {
  padding-top: 6px;
  -webkit-line-clamp: 2;
}

.astros-mobile-remote__chip {
  position: absolute;
  top: 8px;
  left: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 2px 10px;
  border-radius: 999px;
  font-size: 8.5px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-align: center;
  text-transform: uppercase;
  white-space: nowrap;
  transform: translateX(-50%);
}
.astros-mobile-remote--compact .astros-mobile-remote__chip {
  top: 4px;
  right: 4px;
  left: 4px;
  font-size: 7px;
  padding: 2px 6px;
  transform: none;
}

.astros-mobile-remote__chip--script {
  background: rgba(255, 255, 255, 0.18);
  color: #ffffff;
}

.astros-mobile-remote__chip--playlist {
  background: var(--mr-complement);
  color: #000000;
}

.astros-mobile-remote__chip-icon {
  width: 9px;
  height: 9px;
}
.astros-mobile-remote--compact .astros-mobile-remote__chip-icon {
  width: 7px;
  height: 7px;
}

/* === PAGINATION ROW === */
.astros-mobile-remote__pagination {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 18px 8px;
}
.astros-mobile-remote--compact .astros-mobile-remote__pagination {
  padding: 6px 10px;
}

.astros-mobile-remote__page-nav {
  width: 36px;
  height: 36px;
  border: 1px solid var(--mr-border);
  border-radius: 50%;
  background: var(--mr-base-100);
  color: var(--mr-ink);
  font-size: 18px;
  cursor: pointer;
}
.astros-mobile-remote--compact .astros-mobile-remote__page-nav {
  width: 26px;
  height: 26px;
  font-size: 14px;
}

.astros-mobile-remote__page-nav[disabled] {
  color: var(--mr-border-strong);
  cursor: default;
}

.astros-mobile-remote__dots {
  display: flex;
  gap: 4px;
}

.astros-mobile-remote__dot {
  width: 7px;
  height: 7px;
  padding: 0;
  border: none;
  border-radius: 3px;
  background: var(--mr-border);
  cursor: pointer;
  transition: all 150ms;
}
.astros-mobile-remote--compact .astros-mobile-remote__dot {
  width: 5px;
  height: 5px;
}

.astros-mobile-remote__dot--active {
  width: 22px;
  background: var(--mr-primary);
}
.astros-mobile-remote--compact .astros-mobile-remote__dot--active {
  width: 14px;
}

/* === TOAST === */
.astros-mobile-remote__toast {
  position: absolute;
  bottom: 116px;
  left: 50%;
  padding: 8px 14px;
  background: var(--mr-toast-bg);
  border-radius: 999px;
  color: #ffffff;
  font-size: 12px;
  font-weight: 500;
  white-space: nowrap;
  pointer-events: none;
  transform: translateX(-50%);
}
.astros-mobile-remote--compact .astros-mobile-remote__toast {
  bottom: 76px;
  padding: 4px 10px;
  font-size: 9px;
}

/* === PANIC BUTTON === */
.astros-mobile-remote__panic-wrap {
  flex-shrink: 0;
  padding: 6px 18px 16px;
}
.astros-mobile-remote--compact .astros-mobile-remote__panic-wrap {
  padding: 4px 10px 10px;
}

.astros-mobile-remote__panic {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  padding: 14px 0;
  overflow: hidden;
  border: none;
  border-radius: 16px;
  background: var(--mr-panic-idle);
  color: #ffffff;
  font-size: 15px;
  font-weight: 800;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  cursor: pointer;
  transition:
    background 80ms,
    transform 80ms;
  box-shadow:
    0 2px 0 rgba(0, 0, 0, 0.25),
    0 6px 16px rgba(201, 31, 31, 0.35);
}
.astros-mobile-remote--compact .astros-mobile-remote__panic {
  padding: 8px 0;
  border-radius: 12px;
  font-size: 11px;
}

.astros-mobile-remote__panic--active {
  background: var(--mr-panic-active);
  transform: translateY(1px);
  box-shadow: inset 0 2px 6px rgba(0, 0, 0, 0.4);
}

.astros-mobile-remote__panic-fill {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.28);
  transform: scaleX(0);
  transform-origin: left center;
  transition: transform 120ms;
  pointer-events: none;
}

.astros-mobile-remote__panic-fill--arming {
  transform: scaleX(1);
  transition: transform 600ms linear;
}

.astros-mobile-remote__panic-label {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.astros-mobile-remote__panic-glyph {
  width: 10px;
  height: 10px;
  background: #ffffff;
  border-radius: 2px;
}
.astros-mobile-remote--compact .astros-mobile-remote__panic-glyph {
  width: 8px;
  height: 8px;
}

.astros-mobile-remote__panic-caption {
  margin-top: 4px;
  color: var(--mr-ink-soft);
  font-size: 10px;
  letter-spacing: 0.04em;
  text-align: center;
}
.astros-mobile-remote--compact .astros-mobile-remote__panic-caption {
  font-size: 8px;
}
</style>
