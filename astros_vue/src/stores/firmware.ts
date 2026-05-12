import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import apiService, { apiClient } from '@/api/apiService';
import { FIRMWARE_FLASH, FIRMWARE_RELEASES } from '@/api/endpoints';
import { compareTags } from '@/utils/version';
import { mapHttpErrorToFlashEnvelope } from '@/utils/firmwareFlashError';
import { controllerStatePillKind, mapServerStageToUiStage } from '@/utils/firmwareStageMapping';
import { useControllerStore } from '@/stores/controller';
import { ControllerStatus } from '@/enums';
import type {
  ControllerFlashState,
  ControllerOnlineStatus,
  FirmwareControllerView,
  FirmwarePhase,
  FirmwareSourceMode,
  FirmwareStage,
  FlashErrorEnvelope,
  FlashErrorReason,
  FlashJobFailedData,
  FlashJobState,
  ReleaseInfo,
  ReleaseListResult,
  ReleasesLoadState,
} from '@/types/firmware';

// Recognized server-side flash error reasons. Used by applyJobFailed to
// validate the WS payload's `reason` field before surfacing it to the UI —
// unrecognized strings fall back to internal_server_error rather than
// rendering as a missing-i18n-key path.
const KNOWN_FLASH_ERROR_REASONS: ReadonlySet<FlashErrorReason> = new Set<FlashErrorReason>([
  'invalid_body',
  'job_already_running',
  'no_controllers',
  'variant_mismatch',
  'variant_unknown',
  'release_not_found',
  'asset_not_found',
  'no_upload',
  'release_lookup_failed',
  'source_resolution_failed',
  'controllers_lookup_failed',
  'subscriber_attach_failed',
  'protocol_violation',
  'streamer_unknown_error',
  'internal_server_error',
  'network_error',
]);

// Master designation: Body is the ESP-NOW sentinel master per project
// convention (see `project_master_esp_sentinel_mac` memory). If this ever
// flips, the firmware side has to flip first — keep cross-referenced.
const FLEET_LAYOUT: ReadonlyArray<{
  id: string;
  label: string;
  glyph: string;
  isMaster: boolean;
}> = [
  { id: 'body', label: 'Body', glyph: 'B', isMaster: true },
  { id: 'core', label: 'Core', glyph: 'C', isMaster: false },
  { id: 'dome', label: 'Dome', glyph: 'D', isMaster: false },
];

function projectControllerStatus(status: ControllerStatus): ControllerOnlineStatus {
  switch (status) {
    case ControllerStatus.UP:
      return 'up';
    case ControllerStatus.DOWN:
      return 'down';
    case ControllerStatus.NEEDS_SYNCED:
    case ControllerStatus.FIRMWARE_INCOMPATIBLE:
      // FIRMWARE_INCOMPATIBLE collapses to needsSynced for the firmware-view
      // flow — running the flash IS the sync. The pill copy is appropriate
      // for both states (controller is reachable but needs operator action).
      return 'needsSynced';
  }
}

export const useFirmwareStore = defineStore('firmware', () => {
  const releases = ref<ReleaseInfo[]>([]);
  const releasesLoadState = ref<ReleasesLoadState>('idle');
  const staleSince = ref<string | null>(null);

  const sourceMode = ref<FirmwareSourceMode>('github');
  const selectedReleaseTag = ref<string | null>(null);
  const uploadedFilename = ref<string | null>(null);

  const selectedControllerIds = ref<ReadonlySet<string>>(new Set());

  const phase = ref<FirmwarePhase>('idle');
  const currentStage = ref<FirmwareStage | null>(null);
  const flashError = ref<FlashErrorEnvelope | null>(null);
  const failedController = ref<{ id: string; label: string; stage: FirmwareStage } | null>(null);

  // WS-pushed state. Apply* handlers below are the sole writers.
  const currentJob = ref<FlashJobState | null>(null);
  const controllerStates = ref<ReadonlyMap<string, ControllerFlashState>>(new Map());
  // Set by `startFlash` from the POST response so the UI can tell whether the
  // active flash belongs to us vs. another operator (lock-conflict UI).
  const ownJobId = ref<string | null>(null);

  // Project the per-location controller store into a fleet shape the firmware
  // view consumes. Reads are reactive through useControllerStore — changes
  // to per-location refs propagate through this computed automatically.
  const controllers = computed<FirmwareControllerView[]>(() => {
    const cs = useControllerStore();
    const statusByLocation = {
      body: cs.bodyStatus,
      core: cs.coreStatus,
      dome: cs.domeStatus,
    } as const;
    const firmwareByLocation = {
      body: cs.bodyFirmware,
      core: cs.coreFirmware,
      dome: cs.domeFirmware,
    } as const;
    return FLEET_LAYOUT.map((slot) => ({
      id: slot.id,
      label: slot.label,
      glyph: slot.glyph,
      isMaster: slot.isMaster,
      current: firmwareByLocation[slot.id as keyof typeof firmwareByLocation] ?? '—',
      status: projectControllerStatus(statusByLocation[slot.id as keyof typeof statusByLocation]),
    }));
  });

  // Selection-vs-fleet reconciliation is unnecessary: the `controllers`
  // computed projects a fixed FLEET_LAYOUT (body / core / dome) so orphan
  // selected ids are structurally impossible. If FLEET_LAYOUT ever becomes
  // dynamic (e.g. a new controller location is added), add a `watch` here
  // that prunes selectedControllerIds against the current fleet.

  const target = computed<string | null>(() => {
    if (sourceMode.value === 'github') return selectedReleaseTag.value;
    return uploadedFilename.value ? 'local-build' : null;
  });

  function isDowngrade(controllerId: string): boolean {
    const t = target.value;
    if (t === null) return false;
    const c = controllers.value.find((x) => x.id === controllerId);
    if (!c) return false;
    const cmp = compareTags(c.current, t);
    return cmp > 0;
  }

  function isBlocked(controllerId: string): boolean {
    const c = controllers.value.find((x) => x.id === controllerId);
    if (!c) return false;
    return c.status === 'down' || isDowngrade(controllerId);
  }

  const anyDowngradeBlocked = computed(() => [...selectedControllerIds.value].some(isDowngrade));

  const canFlash = computed(
    () =>
      target.value !== null && selectedControllerIds.value.size > 0 && !anyDowngradeBlocked.value,
  );

  const isOwnJob = computed(
    () => currentJob.value !== null && currentJob.value.jobId === ownJobId.value,
  );

  // Selection actions always replace the Set (not mutate in place) so Vue
  // tracks the change — refs track value reassignment, not Set methods.
  function toggle(id: string): void {
    const next = new Set(selectedControllerIds.value);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    selectedControllerIds.value = next;
  }

  function selectAll(): void {
    selectedControllerIds.value = new Set(
      controllers.value.filter((c) => !isBlocked(c.id)).map((c) => c.id),
    );
  }

  function clear(): void {
    selectedControllerIds.value = new Set();
  }

  function setPhase(next: FirmwarePhase): void {
    phase.value = next;
  }

  function resetToSelect(): void {
    phase.value = 'select';
    currentStage.value = null;
    flashError.value = null;
    failedController.value = null;
    currentJob.value = null;
    controllerStates.value = new Map();
    ownJobId.value = null;
  }

  function dismissError(): void {
    flashError.value = null;
  }

  // ---------- WS handlers (the sole writers of server-pushed fields) ----------

  /**
   * Translate a wire-level controllerId (MAC) to a fleet slot id
   * ('body' / 'core' / 'dome'). Returns null for unknown MACs — the caller
   * surfaces a dev warning and drops the update so the panel can't render
   * stale per-controller pills against an unknown row.
   */
  function resolveSlot(controllerId: string): string | null {
    const cs = useControllerStore();
    const loc = cs.controllerIdToLocation(controllerId);
    return loc;
  }

  function buildControllerStatesMap(
    states: ReadonlyArray<ControllerFlashState> | undefined,
  ): ReadonlyMap<string, ControllerFlashState> {
    const m = new Map<string, ControllerFlashState>();
    // Defensive: a malformed flashJobStarted with no `controllers` field
    // must not throw on iteration. The empty Map is a valid intermediate
    // state — flashControllerUpdate events will populate it as they arrive.
    if (!states) return m;
    for (const s of states) {
      const slot = resolveSlot(s.controllerId);
      if (slot === null) {
        if (import.meta.env.DEV) {
          console.warn(
            `[firmwareStore] applyJobStarted: unknown controllerId="${s.controllerId}" ` +
              `(no MAC → location mapping yet). Dropping this entry; LocationStatus must arrive first.`,
          );
        }
        continue;
      }
      // Re-key by slot so the panel's progressByControllerId[c.id] lookup
      // (where c.id is 'body'/'core'/'dome') resolves correctly.
      m.set(slot, { ...s, controllerId: slot });
    }
    return m;
  }

  function applyJobStarted(data: FlashJobState): void {
    // Idempotent + replace-not-merge: on duplicate (reconnect / late-join),
    // overwrite controllerStates fully so stale entries can't survive.
    // Snapshot regression hazard (snapshot lands after a more-recent
    // applyControllerUpdate) is precluded by single-WS in-order delivery —
    // the server emits flashJobStarted snapshots on connect, before any
    // post-reconnect flashControllerUpdate.
    currentJob.value = data;
    controllerStates.value = buildControllerStatesMap(data.controllers);
    if (phase.value !== 'flashing') phase.value = 'flashing';
    flashError.value = null;
    failedController.value = null;
  }

  function applyControllerUpdate(data: ControllerFlashState): void {
    const slot = resolveSlot(data.controllerId);
    if (slot === null) {
      if (import.meta.env.DEV) {
        console.warn(
          `[firmwareStore] applyControllerUpdate: unknown controllerId="${data.controllerId}". ` +
            `Update ignored. LocationStatus must populate the MAC mapping first.`,
        );
      }
      return;
    }
    const next = new Map(controllerStates.value);
    next.set(slot, { ...data, controllerId: slot });
    controllerStates.value = next;
    const ui = mapServerStageToUiStage(data.stage);
    if (ui !== null) currentStage.value = ui;
  }

  function applyControllerResult(payload: {
    jobId: string;
    controller: ControllerFlashState;
  }): void {
    applyControllerUpdate(payload.controller);
  }

  function applyJobDone(data: { jobId: string; endedAt: string }): void {
    if (currentJob.value) {
      currentJob.value = { ...currentJob.value, endedAt: data.endedAt };
    }
    phase.value = 'done';
    currentStage.value = null;
  }

  function applyJobFailed(data: FlashJobFailedData): void {
    // Pre-streamer failures (release_not_found, variant_mismatch, etc.)
    // arrive without a prior flashJobStarted, so currentJob may be null.
    // We deliberately do NOT synthesize a currentJob in that case — the
    // operator's truth source for "no flash started" is the unchanged
    // null currentJob; the failure surfaces via flashError below.
    if (currentJob.value) {
      currentJob.value = {
        ...currentJob.value,
        endedAt: data.endedAt,
        abortReason: data.abortReason,
      };
    }
    phase.value = 'failed';
    // Map server-side reason onto FlashErrorReason if recognized, otherwise
    // fall back to internal_server_error. Forward-compat: a new server-side
    // reason renders the generic banner until the client union is updated.
    const reason: FlashErrorReason =
      typeof data.reason === 'string' &&
      KNOWN_FLASH_ERROR_REASONS.has(data.reason as FlashErrorReason)
        ? (data.reason as FlashErrorReason)
        : 'internal_server_error';
    flashError.value = { reason, detail: data.detail };
    // Find the controller that ended in FAILED; surface its label + UI stage.
    for (const state of controllerStates.value.values()) {
      if (state.stage === 'FAILED') {
        const c = controllers.value.find((x) => x.id === state.controllerId);
        const uiStage = mapServerStageToUiStage(state.stage) ?? currentStage.value ?? 'transfer';
        failedController.value = {
          id: state.controllerId,
          label: c?.label ?? state.controllerId,
          stage: uiStage,
        };
        break;
      }
    }
    currentStage.value = null;
  }

  // ---------- HTTP actions ----------

  // 30s timeout on the flash POST. axios's default is no timeout — a hung
  // backend would otherwise leave phase stuck at 'flashing' with no UI
  // recovery short of a page refresh.
  const FLASH_POST_TIMEOUT_MS = 30_000;

  async function startFlash(): Promise<void> {
    if (!canFlash.value || phase.value === 'flashing') return;
    flashError.value = null;
    const body =
      sourceMode.value === 'github'
        ? { source: { kind: 'github' as const, version: selectedReleaseTag.value } }
        : { source: { kind: 'upload' as const } };
    phase.value = 'flashing';
    try {
      const response = await apiClient.post(FIRMWARE_FLASH, body, {
        timeout: FLASH_POST_TIMEOUT_MS,
      });
      const responseBody = response.data as FlashJobState | undefined;
      if (responseBody?.jobId) {
        ownJobId.value = responseBody.jobId;
      }
      // From here on the WS surface owns phase transitions, per-controller
      // stage progression, completion, and failure. applyJobStarted is
      // idempotent so the matching WS event (which the server emits before
      // the HTTP response resolves) is safe.
    } catch (error) {
      // Direct apiClient.post bypasses apiService.post's console.error
      // wrapper, so log here to preserve the dev breadcrumb.
      console.error('firmware.startFlash failed', error);
      phase.value = 'select';
      flashError.value = mapHttpErrorToFlashEnvelope(error);
    }
  }

  async function cancelFlash(reason: string = 'operator'): Promise<void> {
    try {
      // Uses apiClient directly (not the apiService.delete wrapper) because
      // the wrapper passes the second arg as `params`, not request body. The
      // server reads `req.body?.reason`, so the body must transmit.
      await apiClient.delete(FIRMWARE_FLASH, { data: { reason } });
    } catch (error) {
      // Best-effort: failure here is logged but doesn't transition phase — the
      // WS surface owns post-cancel state truth.
      console.warn('firmware.cancelFlash failed', error);
    }
  }

  // Cold-load resync. Mounted views call this to populate currentJob from
  // the server if a flash is already in flight (e.g., the operator refreshed
  // the page mid-flash). The WS late-join snapshot follows on connect; both
  // paths set the same data so applyJobStarted idempotency keeps state coherent.
  async function fetchCurrentJob(): Promise<void> {
    try {
      const response = await apiClient.get(FIRMWARE_FLASH);
      const body = response.data as FlashJobState | null;
      if (body && body.jobId && currentJob.value === null) {
        applyJobStarted(body);
      }
    } catch (error) {
      console.warn('firmware.fetchCurrentJob failed', error);
    }
  }

  async function fetchReleases(): Promise<void> {
    releasesLoadState.value = 'loading';
    try {
      const response = (await apiService.get(FIRMWARE_RELEASES)) as ReleaseListResult;
      releases.value = response.releases;
      staleSince.value = response.staleSince;
      releasesLoadState.value = response.staleSince === null ? 'loaded' : 'stale';
    } catch (error) {
      // Preserve the prior `releases` list so the UI can keep showing the
      // last known release set while displaying an error indicator.
      console.warn('firmware.fetchReleases failed', error);
      releasesLoadState.value = 'error';
    }
  }

  // Project the controllerStates Map into the shape the panel expects.
  const progressByControllerId = computed(() => {
    const out: Record<
      string,
      { status: ReturnType<typeof controllerStatePillKind>; stageLabel?: string }
    > = {};
    for (const [id, state] of controllerStates.value) {
      out[id] = { status: controllerStatePillKind(state) };
      const uiStage = mapServerStageToUiStage(state.stage);
      if (uiStage !== null) {
        out[id].stageLabel = uiStage;
      }
    }
    return out;
  });

  return {
    releases,
    releasesLoadState,
    staleSince,
    sourceMode,
    selectedReleaseTag,
    uploadedFilename,
    controllers,
    selectedControllerIds,
    phase,
    currentStage,
    flashError,
    failedController,
    currentJob,
    controllerStates,
    ownJobId,
    target,
    anyDowngradeBlocked,
    canFlash,
    isOwnJob,
    progressByControllerId,
    toggle,
    selectAll,
    clear,
    setPhase,
    resetToSelect,
    dismissError,
    applyJobStarted,
    applyControllerUpdate,
    applyControllerResult,
    applyJobDone,
    applyJobFailed,
    startFlash,
    cancelFlash,
    fetchCurrentJob,
    fetchReleases,
  };
});
