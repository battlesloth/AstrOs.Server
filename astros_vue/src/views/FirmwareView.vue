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
import { useJobLockStore } from '@/stores/jobLock';
import { useWebsocket } from '@/composables/useWebsocket';
import type { FirmwareControllerView, TopologyFleet } from '@/components';

import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';

const { t } = useI18n();
const firmware = useFirmwareStore();
const jobLock = useJobLockStore();
const {
  phase,
  controllers,
  selectedControllerIds,
  target,
  currentStage,
  failedControllers,
  sourceMode,
  uploadedFilename,
  progressByControllerId,
  isOwnJob,
  currentJobLoadFailed,
  flashError,
  currentJob,
} = storeToRefs(firmware);
const { locked: lockLocked, since: lockSince } = storeToRefs(jobLock);
// WS connection state. Drives the "live updates suspended" banner when a
// flash is in flight but the socket is down — without this signal the
// operator would stare at frozen progress with no indication that the
// stream has stopped. Gated on `wsHasEverConnected` so the banner doesn't
// flicker during the ~50ms between FirmwareView mount and the first
// onopen: until the socket has ever connected, "disconnected" isn't yet
// a meaningful staleness signal — it's the expected pre-connect state.
const { wsIsConnected, wsHasEverConnected } = useWebsocket();
const flashStreamSuspended = computed(
  () => phase.value === 'flashing' && wsHasEverConnected.value && !wsIsConnected.value,
);

// Mid-flash + pre-streamer-abort + failed-with-detail error region. The
// panel's `flash_error_banner` is gated on phase==='select' (it surfaces
// HTTP POST failures before the job lifecycle owns phase). This region
// fires on three additional paths:
//   - useWebsocket's mid-stream catch blocks (phase==='flashing')
//   - applyJobFailed with empty failedControllers (pre-streamer abort —
//     job failed before any controller transitioned to FAILED, so the
//     panel's "⚠ — failed during the flash" result bar is uselessly vague)
//   - applyJobFailed with non-empty failedControllers AND a detail string
//     (the panel result bar shows the label + stage but never the detail,
//     so a meaningful reason like "asset checksum mismatch on Core" would
//     otherwise be dropped)
// Without this region, flashError.detail would go to a ref no template reads.
const flashErrorDetail = computed(() => {
  if (flashError.value === null) return null;
  return flashError.value.detail ?? t(`firmware_view.flash_errors.${flashError.value.reason}`);
});
const showFlashErrorRegion = computed(() => {
  if (flashError.value === null) return false;
  if (phase.value === 'flashing') return true;
  // In 'failed' phase, the panel's result bar carries label + stage but
  // never surfaces `flashError.detail`. Show this region when either:
  //   - no controllers were marked FAILED (pre-streamer abort: result bar
  //     is uselessly vague without the detail), OR
  //   - flashError has a non-null detail string (operator should see the
  //     specific reason, not just "Core failed during Verify").
  if (phase.value === 'failed') {
    return failedControllers.value.length === 0 || flashError.value.detail != null;
  }
  // phase='done' with a non-null flashError means a non-blocking warning
  // landed during/after a successful flash (cancel HTTP failed but flash
  // completed; lock-release recovery breadcrumb; malformed terminal-event
  // catch). Surface it alongside the "all updated" footer rather than
  // swallowing the signal.
  return phase.value === 'done';
});

// Distinct title for the done-phase warning case — a red "Flash failed:"
// over an "all updated" footer would be visually contradictory.
const flashErrorTitleKey = computed(() => {
  if (phase.value === 'failed') return 'firmware_view.mid_flash_error.title_failed';
  if (phase.value === 'done') return 'firmware_view.mid_flash_error.title_done_warning';
  return 'firmware_view.mid_flash_error.title_warning';
});

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

// Topology highlights the first FAILED controller (it animates one node, not
// a set); the panel result bar joins ALL failed labels so multi-failure is
// visible to the operator. Stage is taken from the first FAILED — all entries
// share the same fallback stage in practice (`currentStage` at failure time).
// `failedControllerLabels` returns `''` on no failures; the template coerces
// to `undefined` via `|| undefined` so the panel's result bar skips rendering.
const failedControllerId = computed(() => failedControllers.value[0]?.id);
const failedControllerLabels = computed(() =>
  failedControllers.value.map((c) => c.label).join(', '),
);
const failedStage = computed(() => failedControllers.value[0]?.stage ?? null);

// Formats lockSince's raw ISO timestamp for the operator. Without the
// formatter, the lock-conflict body would interpolate "2026-05-12T08:00:00Z"
// directly into the message body — a machine-readable string in operator UX.
const lockSinceFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
});
const lockSinceFormatted = computed(() => {
  const raw = lockSince.value;
  if (raw === null) return '—';
  // Defensive: a malformed ISO produces an Invalid Date whose getTime()
  // returns NaN. Fall back to the raw string so the operator at least
  // sees something instead of a NaN/Invalid string from the formatter.
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? raw : lockSinceFormatter.format(d);
});

// A flash is in flight but it isn't ours — suppress the working UI. The
// SourceStrip + grid v-ifs below gate on !lockConflict so the Flash button
// isn't reachable while a foreign flash is in flight.
const lockConflict = computed(() => lockLocked.value && !isOwnJob.value);

// Dev-only invariant warning. Surfaces wiring bugs in the controllers-store
// adapter; production strips the block via Vite tree-shake.
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

onMounted(async () => {
  // Cold-load resync: if a flash is already in flight (operator refreshed
  // the page mid-flash), populate currentJob from the server. WS late-join
  // snapshot follows on connect; both paths set the same data and the
  // store's applyJobStarted idempotency keeps state coherent.
  //
  // fetchReleases is fire-and-forget — kicking it off in parallel without
  // awaiting it. The releases endpoint can take up to 10s on a cold cache
  // (GitHub round-trip after a server restart), and gating phase on it
  // would leave the operator staring at a blank page. The source strip
  // already renders a `releases_loading` affordance while
  // releasesLoadState === 'loading', so the wait is communicated in-place
  // once phase moves to 'select'. fetchCurrentJob, by contrast, must be
  // awaited: if it were also fire-and-forget, the `phase === 'idle'` guard
  // below would fire while the job lookup was still in flight and briefly
  // paint the 'select' UI before applyJobStarted snapped phase to
  // 'flashing' on a mid-flash refresh.
  void firmware.fetchReleases();
  await firmware.fetchCurrentJob();
  if (firmware.phase === 'idle') {
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

          <div
            v-if="currentJobLoadFailed"
            class="firmware-view__stale-warning"
            role="status"
            aria-live="polite"
          >
            {{ t('firmware_view.current_job_load_failed') }}
          </div>

          <div
            v-if="flashStreamSuspended"
            class="firmware-view__stale-warning"
            role="status"
            aria-live="polite"
          >
            {{ t('firmware_view.flash_stream_suspended') }}
          </div>

          <!--
            role="alert" implies aria-live="assertive" by default. We
            explicitly override to "polite" because a flapping WS can
            re-fire malformed events; assertive would announce each one
            and drown the operator. The keep-the-role-for-semantics +
            polite-the-announcement pattern matches WAI-ARIA guidance.
          -->
          <div
            v-if="showFlashErrorRegion"
            class="firmware-view__flash-error"
            role="alert"
            aria-live="polite"
            data-test="mid-flash-error"
          >
            <span class="firmware-view__flash-error-title">{{ t(flashErrorTitleKey) }}</span>
            <span class="firmware-view__flash-error-detail">{{ flashErrorDetail }}</span>
            <span
              v-if="phase === 'failed' && currentJob?.abortReason"
              class="firmware-view__flash-error-abort-reason"
              data-test="abort-reason"
            >
              {{
                t('firmware_view.mid_flash_error.abort_reason', {
                  reason: currentJob.abortReason,
                })
              }}
            </span>
            <button
              type="button"
              class="firmware-view__flash-error-dismiss"
              @click="firmware.dismissError()"
            >
              {{ t('firmware_view.mid_flash_error.dismiss') }}
            </button>
          </div>

          <div
            v-if="lockConflict"
            class="firmware-view__lock-conflict"
            role="alert"
          >
            <span class="firmware-view__lock-conflict-title">{{
              t('firmware_view.lock_conflict.title')
            }}</span>
            <span class="firmware-view__lock-conflict-body">{{
              t('firmware_view.lock_conflict.body', { since: lockSinceFormatted })
            }}</span>
          </div>

          <AstrosFirmwareSourceStrip v-if="phase === 'select' && !lockConflict" />

          <div
            v-if="phase !== 'idle' && !lockConflict"
            class="firmware-view__grid"
          >
            <div class="firmware-view__left-column">
              <AstrosFirmwareTopology
                v-if="topologyFleet"
                :fleet="topologyFleet"
                :selected-ids="[...selectedControllerIds]"
                :target="target"
                :phase="phase"
                :current-stage="currentStage"
                :failed-controller-id="failedControllerId"
              />
              <AstrosFirmwareStagesList
                v-if="phase === 'flashing' || phase === 'done' || phase === 'failed'"
                :phase="phase"
                :current-stage="currentStage"
                :failed-stage="failedStage"
              />
            </div>

            <AstrosFirmwareControllersPanel
              class="firmware-view__panel"
              :phase="phase"
              :progress-by-controller-id="progressByControllerId"
              :failed-controller-label="failedControllerLabels || undefined"
              :failed-stage="failedStage ?? undefined"
              :failed-count="failedControllers.length"
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

.firmware-view__flash-error {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  background: #fbe0e0;
  border: 1px solid #cf424255;
  border-radius: 6px;
}

.firmware-view__flash-error-title {
  font-family: 'Inter', system-ui, sans-serif;
  font-size: 12px;
  font-weight: 700;
  color: #9a2828;
}

.firmware-view__flash-error-detail {
  font-family: 'Inter', system-ui, sans-serif;
  font-size: 12px;
  color: #9a2828;
  flex: 1;
}

.firmware-view__flash-error-dismiss {
  appearance: none;
  background: transparent;
  border: 1px solid #9a2828;
  border-radius: 3px;
  padding: 4px 10px;
  font-family: inherit;
  font-size: 11px;
  font-weight: 600;
  color: #9a2828;
  cursor: pointer;
}

.firmware-view__flash-error-dismiss:hover {
  background: #9a2828;
  color: #ffffff;
}

.firmware-view__stale-warning {
  padding: 10px 14px;
  background: #fff8e8;
  border: 1px solid #e5a93a55;
  border-radius: 6px;
  font-family: 'Inter', system-ui, sans-serif;
  font-size: 12px;
  color: #7d5a14;
}

.firmware-view__lock-conflict {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 16px;
  background: #fff8e8;
  border: 1px solid #e5a93a55;
  border-radius: 6px;
}

.firmware-view__lock-conflict-title {
  font-family: 'Inter', system-ui, sans-serif;
  font-size: 13px;
  font-weight: 700;
  color: #7d5a14;
}

.firmware-view__lock-conflict-body {
  font-family: 'Inter', system-ui, sans-serif;
  font-size: 12px;
  color: #7d5a14;
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
