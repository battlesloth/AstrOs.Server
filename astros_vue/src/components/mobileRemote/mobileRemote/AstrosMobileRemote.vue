<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch, type PropType } from 'vue';
import { useI18n } from 'vue-i18n';
import type { RemoteControlPage } from '@/models/remoteControl/remoteControlPage';
import { BUTTON_KEYS } from '@/models/remoteControl/remoteControlPage';
import type { PageButton } from '@/models/remoteControl/pageButton';
import { useHoldGesture } from '@/composables/useHoldGesture';
import { useSwipeGesture } from '@/composables/useSwipeGesture';
import { isFilledPageButton, type AstrosMobileRemotePressEvent } from './types';

const props = defineProps({
  pages: {
    type: Array as PropType<RemoteControlPage[]>,
    required: true,
  },
  // Out-of-range values (negative, or >= pages.length) clamp to the nearest
  // valid page rather than no-op. Parents that want "leave the current page
  // alone" should omit the prop or pass the existing current index, not a
  // sentinel like -1.
  initialIdx: {
    type: Number,
    default: 0,
  },
  compact: {
    type: Boolean,
    default: false,
  },
  // Defaults to `true` so the standalone-component case (and Storybook)
  // render the intended "Connected" chip when a parent doesn't pipe in a
  // live connection signal.
  connected: {
    type: Boolean,
    default: true,
  },
  // When false, the embedded remote is locked to `initialIdx`: pagination
  // arrows + dots are hidden, swipe gestures on the grid are ignored. Used
  // by the editor's live preview (Decision 1) so the right rail can't drift
  // away from the page the user selected in the page list. Defaults to true
  // so the standalone mobile route (Phase 4) keeps its full UX.
  navigable: {
    type: Boolean,
    default: true,
  },
  // When false the component renders without its own top bar (wordmark +
  // connection chip). The standalone mobile shell (MobileRemoteView) provides a
  // shared top bar with a connection/navigation toggle button instead, so the
  // embedded grid must not draw a second one. Defaults true so the editor's
  // live preview and Storybook keep the full chrome.
  showTopBar: {
    type: Boolean,
    default: true,
  },
  // When true the server animation queue is panic-stopped, so the Stop-All
  // control morphs into a hold-to-confirm "Clear Panic" button (distinct color,
  // emits `clearPanic`). Fed from the panicState store by the parent.
  inPanicStop: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits<{
  press: [event: AstrosMobileRemotePressEvent];
  panic: [];
  clearPanic: [];
}>();

const { t } = useI18n();

function clampIdx(value: number, pageCount: number): number {
  if (pageCount <= 0) return 0;
  return Math.min(Math.max(0, value), pageCount - 1);
}

// Initial-mount clamp: an out-of-range initialIdx (parent passes 10 with
// pages.length=3) used to leak into the pagination header text and the
// next-button disabled check until the first prop change fired the watcher.
const idx = ref(clampIdx(props.initialIdx, props.pages.length));

// Reseat idx if the parent updates initialIdx after mount.
watch(
  () => props.initialIdx,
  (next) => {
    idx.value = clampIdx(next, props.pages.length);
  },
);

// Settle idx when pages shrinks. The read-time `currentIdx` clamp keeps
// rendering correct on its own, but the watcher must mutate `idx.value`
// so the user doesn't teleport to a stale position if the parent later
// grows `pages` back. Product intent: a shrink is a reset — when pages
// return, the user stays on the post-shrink page rather than jumping to
// some prior index they never re-navigated to.
watch(
  () => props.pages.length,
  (newLen) => {
    idx.value = clampIdx(idx.value, newLen);
  },
);

const pressedButtonId = ref<string | null>(null);
const toastMessage = ref<string | null>(null);

let pressClearTimer: ReturnType<typeof setTimeout> | null = null;
let toastClearTimer: ReturnType<typeof setTimeout> | null = null;

function clearPressTimer() {
  if (pressClearTimer !== null) {
    clearTimeout(pressClearTimer);
    pressClearTimer = null;
  }
}

// Single owner of the toast slot. Replaces any in-flight toast so press and
// panic don't race to clear each other's message — previously two separate
// timer pairs wrote to the same DOM slot, and forgetting to cancel one
// before showing the other clipped the new toast early.
function showToast(message: string, durationMs: number) {
  if (toastClearTimer !== null) clearTimeout(toastClearTimer);
  toastMessage.value = message;
  toastClearTimer = setTimeout(() => {
    toastMessage.value = null;
    toastClearTimer = null;
  }, durationMs);
}

function clearToast() {
  if (toastClearTimer !== null) {
    clearTimeout(toastClearTimer);
    toastClearTimer = null;
  }
}

const panic = useHoldGesture({
  holdMs: 600,
  cooldownMs: 2200,
  onFire: () => {
    // Fire-and-forget by design: the toast says "sending…" because this
    // emit does not wait for delivery. Parents that need a "sent vs failed"
    // visual must gate on their own delivery confirmation (prop or wrapper),
    // not on this emit firing. When panicked, the same hold gesture clears.
    if (props.inPanicStop) {
      showToast(t('mobile_remote.clear_toast'), 1800);
      emit('clearPanic');
    } else {
      showToast(t('mobile_remote.panic_toast'), 1800);
      emit('panic');
    }
  },
});

// Defensive clamp at read-time so mid-prop-update windows (idx is set but
// the matching watcher hasn't yet fired) don't surface the empty-state
// branch when valid pages exist. All template bindings that need to show
// the current index — pagination header, prev/next disabled, dot highlight
// — read through `currentIdx` so an out-of-range raw idx can never leak.
const currentIdx = computed(() => clampIdx(idx.value, props.pages.length));
const currentPage = computed<RemoteControlPage | null>(() => {
  if (props.pages.length === 0) return null;
  return props.pages[currentIdx.value] ?? null;
});
const totalPages = computed(() => props.pages.length);

// Memoize the per-slot lookup so each template binding reads a stable array
// slot instead of re-deriving from BUTTON_KEYS in every attribute expression.
const slots = computed(() => {
  const page = currentPage.value;
  if (page === null) return [];
  return BUTTON_KEYS.map((key) => page[key]);
});

function handlePress(button: PageButton) {
  if (!isFilledPageButton(button)) return;
  // 'arming' is NOT blocked here: the user may change their mind mid-hold
  // and the 600ms window is short enough that "two-handed" presses aren't
  // a real failure mode. Only the committed 'active' lockout (the 2.2s
  // post-fire window) suppresses presses.
  if (panic.state.value === 'active') return;

  pressedButtonId.value = button.id;
  clearPressTimer();
  pressClearTimer = setTimeout(() => {
    pressedButtonId.value = null;
    pressClearTimer = null;
  }, 220);

  showToast(t('mobile_remote.press_toast', { name: button.name }), 1600);

  emit('press', button);
}

function goPrev() {
  if (!props.navigable) return;
  if (currentIdx.value > 0) idx.value = currentIdx.value - 1;
}

function goNext() {
  if (!props.navigable) return;
  if (currentIdx.value < totalPages.value - 1) idx.value = currentIdx.value + 1;
}

function selectPage(target: number) {
  if (!props.navigable) return;
  if (target >= 0 && target < totalPages.value) idx.value = target;
}

// Swipe-to-paginate on the 3x3 grid surface (composable encapsulates the
// distance threshold, vertical-max guard, multi-touch abort, and the
// preventDefault that suppresses synthesized clicks on swipe). Direction
// convention matches iOS Photos / Twitter / Instagram: the content moves
// opposite the finger, so swipe LEFT → next page, swipe RIGHT → previous.
// The goPrev/goNext callbacks short-circuit when navigable is false, so
// swipes are absorbed without changing the displayed page.
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
  clearToast();
  // The useHoldGesture composable cleans up its own timers via onScopeDispose.
});

const stopAllLabel = computed(() => {
  if (props.inPanicStop) {
    if (panic.state.value === 'active') return t('mobile_remote.clear_active');
    if (panic.state.value === 'arming') return t('mobile_remote.clear_arming');
    return t('mobile_remote.clear_idle');
  }
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
    <div
      v-if="showTopBar"
      class="astros-mobile-remote__top-bar"
    >
      <span
        class="astros-mobile-remote__wordmark font-starwars"
        :aria-label="$t('astros')"
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
      <span class="astros-mobile-remote__page-pagination">
        {{ currentIdx + 1 }} / {{ totalPages }}
      </span>
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

    <!-- Pagination row — hidden when navigable=false (e.g., the editor's
         live preview, which locks the index to selectedIdx). -->
    <div
      v-if="navigable"
      class="astros-mobile-remote__pagination"
    >
      <button
        type="button"
        class="astros-mobile-remote__page-nav"
        :disabled="totalPages === 0 || currentIdx === 0"
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
          :class="{ 'astros-mobile-remote__dot--active': i === currentIdx }"
          :aria-label="$t('mobile_remote.dot_aria', { number: i + 1 })"
          :aria-current="i === currentIdx ? 'page' : undefined"
          @click="selectPage(i)"
        ></button>
      </div>
      <button
        type="button"
        class="astros-mobile-remote__page-nav"
        :disabled="totalPages === 0 || currentIdx === totalPages - 1"
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
          'astros-mobile-remote__panic--clear': inPanicStop,
        }"
        :aria-pressed="panic.state.value === 'active'"
        @mousedown="handlePanicDown"
        @mouseup="handlePanicUp"
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
        {{ inPanicStop ? $t('mobile_remote.clear_caption') : $t('mobile_remote.stop_all_caption') }}
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

/* Capital A and O scale up to enforce the "AstrOs" branding rhythm. Uses
 * em (not px) so the compact and full sizes both scale proportionally. */
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

/* Clear-Panic mode: recolor away from danger red to the primary so it reads as
   "recover / re-enable", not "stop". Wins over the base red (later source
   order) and over --active (two-class specificity) when both are present. */
.astros-mobile-remote__panic--clear {
  background: var(--mr-primary, #2a5a97);
  box-shadow:
    0 2px 0 rgba(0, 0, 0, 0.2),
    0 6px 16px rgba(42, 90, 151, 0.35);
}
.astros-mobile-remote__panic--clear.astros-mobile-remote__panic--active {
  background: var(--mr-primary-hover, #2f445c);
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
