import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import apiService, { apiClient } from '@/api/apiService';
import { FIRMWARE_FLASH, FIRMWARE_RELEASES, FIRMWARE_UPLOAD } from '@/api/endpoints';
import { compareTags } from '@/utils/version';
import { mapHttpErrorToFlashEnvelope } from '@/utils/firmwareFlashError';
import {
  controllerStageLabelKey,
  controllerStatePillKind,
  mapServerStageToUiStage,
} from '@/utils/firmwareStageMapping';
import { useControllerStore } from '@/stores/controller';
import { ControllerStatus, Location } from '@/enums';
import type {
  ControllerFlashState,
  ControllerFlashStateBySlot,
  ControllerOnlineStatus,
  FirmwareControllerView,
  FirmwarePhase,
  FirmwareSourceMode,
  FailedControllerSummary,
  FirmwareStage,
  FirmwareStageLabelKey,
  FirmwareUploadResponse,
  SlotId,
  FlashErrorEnvelope,
  FlashErrorReason,
  FlashJobFailedData,
  FlashJobState,
  ReleaseInfo,
  ReleaseListResult,
  ReleasesLoadState,
  UploadedFirmware,
  UploadState,
} from '@/types/firmware';
import { KNOWN_FLASH_ERROR_REASONS } from '@/types/firmware';

// Master designation: Body is the ESP-NOW sentinel master per project
// convention (see `project_master_esp_sentinel_mac` memory). If this ever
// flips, the firmware side has to flip first — keep cross-referenced.
const FLEET_LAYOUT: ReadonlyArray<{
  id: SlotId;
  label: string;
  glyph: string;
  isMaster: boolean;
}> = [
  { id: Location.BODY, label: 'Body', glyph: 'B', isMaster: true },
  { id: Location.CORE, label: 'Core', glyph: 'C', isMaster: false },
  { id: Location.DOME, label: 'Dome', glyph: 'D', isMaster: false },
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
  // Operator-supplied filename (cosmetic — surfaced in the source strip
  // eyebrow while the upload is in flight). `uploadedFile` below is the
  // server-acknowledged metadata; `canFlash` gates on `uploadedFile`, not
  // this ref — picking a filename doesn't mean the server has the binary.
  const uploadedFilename = ref<string | null>(null);
  const uploadState = ref<UploadState>('idle');
  const uploadedFile = ref<UploadedFirmware | null>(null);

  const selectedControllerIds = ref<ReadonlySet<string>>(new Set());

  const phase = ref<FirmwarePhase>('idle');
  const currentStage = ref<FirmwareStage | null>(null);
  const flashError = ref<FlashErrorEnvelope | null>(null);
  // All controllers that ended this job in stage='FAILED'. Multi-failure is
  // realistic (bus-wide ESP-NOW failure fails both padawans simultaneously);
  // surfacing only the first would let the operator walk away from a bricked
  // controller. `stage` is `FirmwareStage | null` — null when we can't
  // honestly attribute the failure to a specific stage.
  const failedControllers = ref<FailedControllerSummary[]>([]);

  // WS-pushed state. Apply* handlers + resetToSelect are the writers
  // (resetToSelect for the operator-driven clear; apply* for live state).
  const currentJob = ref<FlashJobState | null>(null);
  // Keyed by SlotId. Wire-side ControllerFlashState carries a MAC string
  // for controllerId; that's translated to a SlotId at the
  // buildControllerStatesMap / applyControllerUpdate boundary.
  const controllerStates = ref<ReadonlyMap<SlotId, ControllerFlashStateBySlot>>(new Map());
  // Set by `startFlash` from the POST response so the UI can tell whether the
  // active flash belongs to us vs. another operator (lock-conflict UI).
  const ownJobId = ref<string | null>(null);

  // True from `startFlash()` entry until either the POST resolves+
  // `currentJob.jobId === ownJobId` AND we've passed the lockStateChanged
  // race window, OR the start fails / the flash terminates. Closes the
  // race where the server's `lockStateChanged{locked:true}` arrives before
  // its `flashJobStarted` (and before the HTTP response carrying `jobId`)
  // — without this flag, the operator's own in-flight flash satisfies
  // `lockLocked && !isOwnJob` and the page wrongly shows the foreign-
  // operator conflict banner. Cleared on every terminal transition.
  const pendingOwnFlashStart = ref(false);

  // Queue of ControllerFlashState payloads dropped because their MAC wasn't
  // yet in the controllerStore's resolver. The cold-load / late-join race:
  // flashJobStarted (or flashControllerUpdate) for a padawan can arrive
  // before its LocationStatus heartbeat has populated the MAC mapping.
  // Without this queue, the dropped event is lost forever and the row
  // freezes at its last-seen stage (or never gets a pill at all). Keyed by
  // raw MAC; `flushPendingForMac` replays on setControllerMac.
  const pendingByMac = ref<Map<string, ControllerFlashState[]>>(new Map());

  // Project the per-location controller store into a fleet shape the firmware
  // view consumes.
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
    // Gate on the server-acknowledged upload, not the local filename — a
    // filename in `uploadedFilename` could be mid-flight or errored. The
    // operator should only see "ready to flash" after the server has
    // parsed and promoted the artifact.
    return uploadedFile.value ? 'local-build' : null;
  });

  // Operator-set escape hatch for the downgrade policy. Defaults to false;
  // flipping to true makes downgrade rows selectable and shifts the modal
  // into ack-required mode. Intentionally NOT cleared by resetToSelect —
  // only a page reload clears it. The modal ack remains the last-chance
  // gate on each individual flash. If a future flow ever adds a second
  // reset path (logout, session timeout), the non-clearing of this ref is
  // a deliberate decision, not an oversight — re-confirm before changing.
  // Uploaded firmware ('local-build') is never classified as a downgrade
  // (compareTags returns NaN), so the toggle is a no-op in upload mode.
  const allowDowngrade = ref(false);

  function isDowngrade(controllerId: string): boolean {
    const t = target.value;
    if (t === null) return false;
    const c = controllers.value.find((x) => x.id === controllerId);
    if (!c) return false;
    const cmp = compareTags(c.current, t);
    return cmp > 0;
  }

  // `down` is reality (controller is unreachable); `isDowngrade` is policy
  // (we choose not to install older firmware by default). Splitting them
  // lets the allowDowngrade toggle relax the policy without overriding the
  // reality. Unknown ids fail-closed: today FLEET_LAYOUT is static so this
  // can't fire, but if FLEET_LAYOUT goes dynamic an orphan selectedId would
  // otherwise slip past canFlash and dispatch a phantom flash target. The
  // warn breadcrumb keeps a future dynamic-fleet bug from manifesting as a
  // silently stuck "cannot flash" with no diagnostic clue.
  function isHardBlocked(controllerId: string): boolean {
    const c = controllers.value.find((x) => x.id === controllerId);
    if (c === undefined) {
      console.warn(
        `[firmwareStore] isHardBlocked: unknown controllerId="${controllerId}" treated as hard-blocked. Stale selection or contract drift.`,
      );
      return true;
    }
    return c.status === 'down';
  }

  function isSelectable(controllerId: string): boolean {
    if (isHardBlocked(controllerId)) return false;
    if (!allowDowngrade.value && isDowngrade(controllerId)) return false;
    return true;
  }

  // True iff a selected controller would downgrade AND the policy override
  // isn't on. Goes false when allowDowngrade flips to true — the policy
  // block is gone regardless of selection.
  const anyDowngradeBlocked = computed(
    () => !allowDowngrade.value && [...selectedControllerIds.value].some(isDowngrade),
  );

  // Whether the fleet contains any controller a downgrade is even possible
  // for. Gates the "Allow downgrades" toggle's visibility — pure-upgrade
  // targets keep the toggle hidden.
  const anyFleetDowngrade = computed(() => controllers.value.some((c) => isDowngrade(c.id)));

  const anyHardBlockedSelected = computed(() =>
    [...selectedControllerIds.value].some(isHardBlocked),
  );

  const canFlash = computed(
    () =>
      target.value !== null &&
      selectedControllerIds.value.size > 0 &&
      !anyHardBlockedSelected.value &&
      !anyDowngradeBlocked.value,
  );

  const isOwnJob = computed(
    () =>
      pendingOwnFlashStart.value ||
      (currentJob.value !== null && currentJob.value.jobId === ownJobId.value),
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
      controllers.value.filter((c) => isSelectable(c.id)).map((c) => c.id),
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
    clearFlashError();
    failedControllers.value = [];
    currentJob.value = null;
    controllerStates.value = new Map();
    ownJobId.value = null;
    pendingOwnFlashStart.value = false;
    pendingByMac.value = new Map();
    currentJobLoadFailed.value = false;
  }

  /** Single writer for `flashError` — keeps the "who set this" audit one-site. */
  function setFlashError(envelope: FlashErrorEnvelope): void {
    flashError.value = envelope;
  }

  /** Paired clear for {@link setFlashError}. */
  function clearFlashError(): void {
    flashError.value = null;
  }

  function dismissError(): void {
    clearFlashError();
  }

  // ---------- WS handlers (the sole writers of server-pushed fields) ----------

  /**
   * Translate a wire-level controllerId (MAC) to a fleet `SlotId`. Returns
   * null when the MAC has no mapping yet OR when the mapped Location is
   * `UNKNOWN` (not a valid slot key). Null is the queue-for-replay signal.
   */
  function resolveSlot(controllerId: string): SlotId | null {
    const cs = useControllerStore();
    const loc = cs.controllerIdToLocation(controllerId);
    if (loc === null || loc === Location.UNKNOWN) return null;
    return loc as SlotId;
  }

  function enqueuePending(state: ControllerFlashState): void {
    const queue = pendingByMac.value.get(state.controllerId) ?? [];
    queue.push(state);
    pendingByMac.value.set(state.controllerId, queue);
  }

  /**
   * Build the FailedControllerSummary[] used by both applyJobDone (when any
   * controller is FAILED despite a job-done lifecycle event) and
   * applyJobFailed. Both surfaces need the same two-pass collection:
   *
   *   1. Mapped slots from `controllerStates` — every FAILED entry, labeled
   *      via the controllers list, falling back to slot id.
   *   2. Unmapped MACs from `pendingByMac` — bus-wide ESP-NOW failures can
   *      mark a padawan FAILED before its LocationStatus heartbeat arrives.
   *      Without surfacing these, the wipe of `pendingByMac` at the bottom
   *      of each caller would silently drop the entry and the job would
   *      render as green-success — the regression class this exists to
   *      prevent.
   *
   * `currentStage.value` is read at call time (callers invoke this BEFORE
   * resetting currentStage), so the resulting `stage` field reflects where
   * the job actually stopped.
   *
   * `callerTag` is only used to prefix the forensic console.warn for the
   * unmapped-MAC branch — kept distinct so log grep can attribute the warn
   * to either the done-with-failures path or the explicit-fail path.
   */
  function collectFailedControllers(
    callerTag: 'applyJobDone' | 'applyJobFailed',
  ): FailedControllerSummary[] {
    const failed: FailedControllerSummary[] = [];
    for (const state of controllerStates.value.values()) {
      if (state.stage === 'FAILED') {
        // controllerId is structurally a SlotId here (the in-store view
        // is ControllerFlashStateBySlot).
        const slot = state.controllerId;
        const c = controllers.value.find((x) => x.id === slot);
        failed.push({ id: slot, label: c?.label ?? slot, stage: currentStage.value });
      }
    }
    for (const [mac, queue] of pendingByMac.value) {
      for (const entry of queue) {
        if (entry.stage === 'FAILED') {
          console.warn(
            `[firmwareStore] ${callerTag}: FAILED entry for unmapped MAC="${mac}" ` +
              `surfaced from pendingByMac. LocationStatus never arrived; using MAC as label.`,
          );
          // Intentional cast: a raw MAC isn't structurally a SlotId, but
          // surfacing the MAC string as the row label is more useful to
          // operators than dropping the entry. The console.warn above is
          // the forensic breadcrumb.
          failed.push({ id: mac as SlotId, label: mac, stage: currentStage.value });
        }
      }
    }
    return failed;
  }

  // The single MAC → SlotId translation site. The returned map and
  // every embedded controllerId is keyed by SlotId; downstream consumers
  // don't need to translate.
  function buildControllerStatesMap(
    states: ReadonlyArray<ControllerFlashState> | undefined,
  ): ReadonlyMap<SlotId, ControllerFlashStateBySlot> {
    const m = new Map<SlotId, ControllerFlashStateBySlot>();
    // Defensive: a string would iterate per-character via for...of and
    // populate pendingByMac with garbage one-char entries; an object
    // throws TypeError (no Symbol.iterator). Empty map is a valid
    // intermediate state — updates will populate it as they arrive.
    if (!Array.isArray(states)) return m;
    for (const s of states) {
      // A malformed entry with no/non-string controllerId would call
      // resolveSlot(undefined) and queue under an undefined key — never
      // drained, never surfaced. Skip + warn so ops can trace the
      // malformed payload back to its source.
      if (!s || typeof s.controllerId !== 'string' || s.controllerId.length === 0) {
        console.warn(
          `[firmwareStore] buildControllerStatesMap: skipping element with invalid controllerId`,
          s,
        );
        continue;
      }
      const slot = resolveSlot(s.controllerId);
      if (slot === null) {
        // Queue for replay when LocationStatus eventually learns this MAC.
        // Without queuing, late-arriving LocationStatus would never recover
        // the dropped snapshot entry and the row would render with no pill.
        enqueuePending(s);
        console.warn(
          `[firmwareStore] applyJobStarted: unknown controllerId="${s.controllerId}" ` +
            `(no MAC → location mapping yet). Queued for replay.`,
        );
        continue;
      }
      // Re-key by slot so the panel's slot-keyed lookups resolve.
      // Explicit switch rather than a blanket spread so TypeScript enforces
      // that every discriminated-union arm is handled and future shape changes
      // (new fields, renamed fields) surface as type errors here rather than
      // silently dropping or carrying stale payload fields.
      let translated: ControllerFlashStateBySlot;
      switch (s.stage) {
        case 'QUEUED':
        case 'UPLOADING_TO_MASTER':
        case 'SENDING':
        case 'VERIFYING':
        case 'FLASHING':
        case 'REBOOTING':
          translated = { ...s, controllerId: slot };
          break;
        case 'FINALIZING':
          // Carry pendingDetail explicitly so the compiler catches any future
          // rename of the field on either side of the wire→BySlot boundary.
          translated = { controllerId: slot, stage: 'FINALIZING', pendingDetail: s.pendingDetail };
          break;
        case 'VERSION_CONFIRMED':
          translated = {
            controllerId: slot,
            stage: 'VERSION_CONFIRMED',
            finalVersion: s.finalVersion,
          };
          break;
        case 'FAILED':
          translated = { controllerId: slot, stage: 'FAILED', error: s.error };
          break;
        default:
          // Runtime safety: skip any future stages the client doesn't yet know
          // about. Compile-time exhaustiveness is enforced by `let translated`
          // being uninitialized — TypeScript will error if any new stage is
          // added to the union but not handled above (the `translated` variable
          // would be used-before-assignment). The `never` assertion below is
          // omitted because TypeScript can't narrow `s.stage` to `never` when
          // the first union arm uses a multi-value stage literal — an inherent
          // TS limitation with compound-discriminant unions.
          continue;
      }
      m.set(slot, translated);
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
    // Drop any pending entries from a prior job before processing the new
    // snapshot. Without this clear, orphan entries (a MAC that never got
    // its LocationStatus during the prior job) would persist and replay
    // against the wrong job once their LocationStatus finally arrived.
    pendingByMac.value = new Map();
    controllerStates.value = buildControllerStatesMap(data.controllers);
    if (phase.value !== 'flashing') phase.value = 'flashing';
    clearFlashError();
    failedControllers.value = [];
    // WS late-join landed → the HTTP staleness warning is no longer accurate
    // even if HTTP itself failed. The store has live state again.
    currentJobLoadFailed.value = false;
  }

  function applyControllerUpdate(data: ControllerFlashState): void {
    // Without this guard, resolveSlot(undefined) returns null and the
    // entry queues under an undefined key — never drained, polluting
    // pendingByMac and surfacing as "undefined" in failedControllers.
    if (!data || typeof data.controllerId !== 'string' || data.controllerId.length === 0) {
      console.warn(
        `[firmwareStore] applyControllerUpdate: skipping element with invalid controllerId`,
        data,
      );
      return;
    }
    // Drop trailing updates after terminal phase: a server retransmit or
    // buffered event flush would otherwise flip a row's pill from 'done'
    // back to 'updating' beneath a footer claiming "all updated."
    if (phase.value === 'done' || phase.value === 'failed') {
      console.warn(
        `[firmwareStore] applyControllerUpdate: dropping update for controllerId="${data.controllerId}" — job already at terminal phase="${phase.value}"`,
      );
      return;
    }
    const slot = resolveSlot(data.controllerId);
    if (slot === null) {
      // Queue for replay; see pendingByMac comment above. Critical: the
      // staleness-banner clear MUST stay below this return — clearing it
      // here would silently dismiss the operator-visible warning every
      // time a WS update arrived for an unmapped controller (UNKNOWN
      // location, contract drift, etc.).
      enqueuePending(data);
      console.warn(
        `[firmwareStore] applyControllerUpdate: unknown controllerId="${data.controllerId}". ` +
          `Queued for replay; LocationStatus must arrive to drain the queue.`,
      );
      return;
    }
    // Belt-and-suspenders: a successful WS update is proof that live state
    // is flowing for a known controller. The applyJobStarted clear is the
    // primary path (server emits the snapshot before per-controller updates
    // on reconnect per applyJobStarted's ordering note); this clear catches
    // edge cases where HTTP fetch failed AND the snapshot was missed.
    currentJobLoadFailed.value = false;
    const next = new Map(controllerStates.value);
    next.set(slot, { ...data, controllerId: slot });
    controllerStates.value = next;
    const ui = mapServerStageToUiStage(data.stage);
    if (ui !== null) currentStage.value = ui;
  }

  /**
   * Drain queued ControllerFlashState payloads for `mac` and re-apply them
   * in insertion order so the final state reflects the most recent
   * server-pushed stage. Idempotent.
   */
  function flushPendingForMac(mac: string): void {
    const queue = pendingByMac.value.get(mac);
    if (!queue || queue.length === 0) return;
    pendingByMac.value.delete(mac);
    for (const entry of queue) {
      applyControllerUpdate(entry);
    }
    // Re-queue detection: if applyControllerUpdate re-enqueued because
    // resolveSlot still returned null (controllerStore/firmwareStore race
    // gap), the entries are stuck. Distinct log so a production stuck-replay
    // loop is visible — the bare warn in applyControllerUpdate can't
    // distinguish first-queue from re-queue-during-flush.
    if (pendingByMac.value.has(mac)) {
      console.warn(
        `[firmwareStore] flushPendingForMac: re-queued during flush for mac="${mac}". ` +
          `MAC mapping inconsistency between controllerStore and firmwareStore.`,
      );
    }
  }

  function applyControllerResult(payload: {
    jobId: string;
    controller: ControllerFlashState;
  }): void {
    if (currentJob.value !== null && payload.jobId !== currentJob.value.jobId) {
      console.warn(
        `[firmwareStore] applyControllerResult: jobId mismatch ` +
          `(payload="${payload.jobId}" current="${currentJob.value.jobId}"). Dropping stale event.`,
      );
      return;
    }
    applyControllerUpdate(payload.controller);
  }

  function applyJobDone(data: { jobId: string; endedAt: string }): void {
    if (currentJob.value !== null && data.jobId !== currentJob.value.jobId) {
      console.warn(
        `[firmwareStore] applyJobDone: jobId mismatch ` +
          `(event="${data.jobId}" current="${currentJob.value.jobId}"). Dropping stale event.`,
      );
      return;
    }
    if (currentJob.value) {
      currentJob.value = { ...currentJob.value, endedAt: data.endedAt };
    }
    // Job terminated — clear the start-pending flag. Subsequent
    // lock-conflict checks fall back to the equality clause, which is
    // load-bearing for foreign-flash detection.
    pendingOwnFlashStart.value = false;
    // Normalize any per-controller state that's still mid-flow to
    // VERSION_CONFIRMED. The server emits flashJobDone when the LAST
    // VERSION_CONFIRMED is observed, but the carrying flashControllerResult
    // may not have drained the WS buffer yet (or may never arrive in some
    // race orderings). Without this normalize, the panel renders the "✓
    // all updated" result bar while individual rows still spin at
    // "updating" — visibly contradictory operator state.
    //
    // Trade-off: this MASKS a real bug if the server emits flashJobDone
    // prematurely (orchestrator race, dropped final POLL_ACK, etc.). A
    // non-terminal row would silently be relabeled VERSION_CONFIRMED. The
    // console.warn below is the post-incident breadcrumb — operators
    // won't see it, but server logs + dev console will surface drift.
    const normalized = new Map(controllerStates.value);
    for (const [slot, state] of normalized) {
      if (state.stage !== 'VERSION_CONFIRMED' && state.stage !== 'FAILED') {
        console.warn(
          `[firmwareStore] applyJobDone: normalizing non-terminal stage="${state.stage}" ` +
            `for slot="${slot}" to VERSION_CONFIRMED. ` +
            `Server emitted job-done before this controller reached terminal — verify the controller actually flashed.`,
        );
        // The discriminated union requires finalVersion on VERSION_CONFIRMED.
        // No real version available here, so use a searchable marker — the
        // "unknown:" prefix is distinct from any real version string and
        // greppable in ops logs.
        normalized.set(slot, {
          controllerId: state.controllerId,
          stage: 'VERSION_CONFIRMED',
          finalVersion: 'unknown:normalize-on-done',
        });
      }
    }
    controllerStates.value = normalized;

    // flashJobDone is a lifecycle event ("every controller reached a
    // terminal state"), NOT a success signal — see
    // flash_orchestrator.ts handleDeployDone. Reconstitute a UI outcome:
    // any FAILED entry routes through the applyJobFailed surface so the
    // result bar, topology, and stages list render the failure rather than
    // a green "all updated". `currentStage.value` is preserved at this
    // point so each FailedControllerSummary captures the UI stage the job
    // was on when the failure landed.
    const failed = collectFailedControllers('applyJobDone');
    if (failed.length > 0) {
      failedControllers.value = failed;
      phase.value = 'failed';
    } else {
      phase.value = 'done';
    }
    currentStage.value = null;
    // Terminal state — the staleness banner is no longer relevant. Without
    // this clear, a fetchCurrentJob failure earlier in the session would
    // leave the warning visible on top of the legitimate done-flash UI.
    currentJobLoadFailed.value = false;
    // Drain the replay queue so a late LocationStatus can't apply stale
    // entries against terminal state. Without this, a queued entry whose
    // MAC mapping arrives after job-done would call applyControllerUpdate,
    // mutate controllerStates and currentStage, and visibly contradict the
    // result bar.
    pendingByMac.value = new Map();
  }

  function applyJobFailed(data: FlashJobFailedData): void {
    if (currentJob.value !== null && data.jobId !== currentJob.value.jobId) {
      console.warn(
        `[firmwareStore] applyJobFailed: jobId mismatch ` +
          `(event="${data.jobId}" current="${currentJob.value.jobId}"). Dropping stale event.`,
      );
      return;
    }
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
    // Terminal: clear the start-pending flag so subsequent lock-conflict
    // checks rely on the equality clause (load-bearing for foreign-flash
    // detection on any next operator action).
    pendingOwnFlashStart.value = false;
    // Map server-side reason onto FlashErrorReason if recognized, otherwise
    // fall back to internal_server_error. Forward-compat: a new server-side
    // reason renders the generic banner until the client union is updated.
    const reason: FlashErrorReason =
      typeof data.reason === 'string' &&
      KNOWN_FLASH_ERROR_REASONS.has(data.reason as FlashErrorReason)
        ? (data.reason as FlashErrorReason)
        : 'internal_server_error';
    setFlashError({ reason, detail: data.detail });
    // Normalize per-controller states still mid-flow to FAILED. A
    // controller stuck at QUEUED/SENDING when the job ends has not
    // confirmed, so showing an "updating" pill beneath a "failed"
    // result bar is contradictory.
    const normalized = new Map(controllerStates.value);
    for (const [slot, state] of normalized) {
      if (state.stage !== 'VERSION_CONFIRMED' && state.stage !== 'FAILED') {
        console.warn(
          `[firmwareStore] applyJobFailed: demoting non-terminal stage="${state.stage}" ` +
            `for slot="${slot}" to FAILED (unattributed). Job ended before this controller reached a terminal stage.`,
        );
        // The discriminated union requires `error` on FAILED. No real
        // server-emitted reason here, so use a searchable marker — the
        // "unattributed:" prefix distinguishes these demotion-derived
        // entries from server-reported failures.
        normalized.set(slot, {
          controllerId: state.controllerId,
          stage: 'FAILED',
          error: 'unattributed:normalize-on-failed',
        });
      }
    }
    controllerStates.value = normalized;
    // Collect ALL controllers that ended in FAILED (including the ones we
    // just demoted) plus any unmapped MACs from pendingByMac. Multi-failure
    // is realistic (bus-wide ESP-NOW failure fails both padawans); surfacing
    // only the first would let the operator walk away from a bricked unit.
    failedControllers.value = collectFailedControllers('applyJobFailed');
    currentStage.value = null;
    // Terminal state — clear the staleness banner so it can't shadow the
    // legitimate failed-flash UI.
    currentJobLoadFailed.value = false;
    // Same rationale as applyJobDone: a late LocationStatus must not
    // replay stale entries onto a finalized failure state.
    pendingByMac.value = new Map();
  }

  // ---------- HTTP actions ----------

  // 30s timeout on the flash POST. axios's default is no timeout — a hung
  // backend would otherwise leave phase stuck at 'flashing' with no UI
  // recovery short of a page refresh.
  const FLASH_POST_TIMEOUT_MS = 30_000;

  async function startFlash(): Promise<void> {
    if (!canFlash.value || phase.value === 'flashing') return;
    clearFlashError();

    // Map slot ids → MAC addresses (the server's identity space). The flash
    // wire contract carries MACs end-to-end: controllerVariantCache is keyed
    // by MAC, the chunk_streamer addresses ESP-NOW peers by MAC. Slot id is
    // the UI-side abstraction only.
    //
    // A selected slot with no known MAC client-side is structurally unusual
    // (selection requires a controller row to exist, which requires a
    // LocationStatus broadcast, which carries the MAC). Skip + warn rather
    // than silently include an empty string — the server's validator would
    // reject anyway, and the warn gives ops a forensic breadcrumb.
    const cs = useControllerStore();
    const macBySlot: Record<string, string | null> = {
      [Location.BODY]: cs.bodyMac,
      [Location.CORE]: cs.coreMac,
      [Location.DOME]: cs.domeMac,
    };
    const controllerMacs: string[] = [];
    for (const slot of selectedControllerIds.value) {
      const mac = macBySlot[slot];
      if (mac === null || mac === undefined) {
        console.warn(
          `[firmwareStore] startFlash: selected slot "${slot}" has no known MAC; skipping. ` +
            `Selection should not have been reachable without a LocationStatus heartbeat — possible store-state drift.`,
        );
        continue;
      }
      controllerMacs.push(mac);
    }
    if (controllerMacs.length === 0) {
      // Defensive: canFlash already gated on selectedControllerIds.size > 0,
      // so the only way here is every selected slot lost its MAC since the
      // gate fired. Surface a flash-error envelope so the panel banner
      // explains rather than silently no-op'ing.
      setFlashError({ reason: 'no_controllers' });
      return;
    }

    const body =
      sourceMode.value === 'github'
        ? {
            source: { kind: 'github' as const, version: selectedReleaseTag.value },
            controllers: controllerMacs,
          }
        : { source: { kind: 'upload' as const }, controllers: controllerMacs };
    // Set the pending flag BEFORE the optimistic phase change so the
    // first `lockStateChanged{locked:true}` WS event (which the server
    // emits immediately on lock acquisition, well before the HTTP
    // response or `flashJobStarted` arrives) sees isOwnJob=true and
    // does NOT trigger the lock-conflict banner on our own flash.
    pendingOwnFlashStart.value = true;
    phase.value = 'flashing';
    try {
      const response = await apiClient.post(FIRMWARE_FLASH, body, {
        timeout: FLASH_POST_TIMEOUT_MS,
      });
      const responseBody = response.data as FlashJobState | undefined;
      if (responseBody?.jobId) {
        ownJobId.value = responseBody.jobId;
      }
      // POST succeeded → the server has accepted the job. If a malformed-WS
      // flashJobStarted arrived during the POST window, its handler rolled
      // phase back to 'select' (useWebsocket.handleFlashJobStarted). Re-
      // assert 'flashing' so the UI matches reality. Legitimate transitions
      // during this window are 'done' or 'failed' (terminal) — never 'select'.
      // The cast widens past TS's post-assignment narrowing — a WS handler
      // can mutate the ref across the await boundary, but TS can't see that.
      if ((phase.value as FirmwarePhase) === 'select') {
        phase.value = 'flashing';
        clearFlashError();
      }
      // From here on the WS surface owns phase transitions, per-controller
      // stage progression, completion, and failure. applyJobStarted is
      // idempotent so the matching WS event (which the server emits before
      // the HTTP response resolves) is safe.
    } catch (error) {
      // Direct apiClient.post bypasses apiService.post's console.error
      // wrapper, so log here to preserve the dev breadcrumb.
      console.error('firmware.startFlash failed', error);
      // POST rejected — we're not the lock holder; clear the pending flag.
      // Terminal handlers cover the success/terminal paths separately.
      pendingOwnFlashStart.value = false;
      phase.value = 'select';
      setFlashError(mapHttpErrorToFlashEnvelope(error));
    }
  }

  async function cancelFlash(reason: string = 'operator'): Promise<void> {
    try {
      // Uses apiClient directly (not the apiService.delete wrapper) because
      // the wrapper passes the second arg as `params`, not request body. The
      // server reads `req.body?.reason`, so the body must transmit.
      await apiClient.delete(FIRMWARE_FLASH, { data: { reason } });
    } catch (error) {
      // 404 = no active job server-side (terminal-reaped, race with
      // heartbeat release, or never-started). WS already drove the UI to
      // a terminal state — silent swallow.
      const status =
        typeof error === 'object' && error !== null && 'response' in error
          ? (error as { response?: { status?: number } }).response?.status
          : undefined;
      if (status === 404) {
        return;
      }
      // Network / 5xx still warrants a breadcrumb so the operator knows
      // the cancel didn't take.
      console.warn('firmware.cancelFlash failed', error);
      setFlashError({
        reason: 'network_error',
        detail: 'Cancel request failed; the flash may still be running. Refresh to recheck status.',
      });
    }
  }

  // Set true when fetchCurrentJob fails with a 5xx or network error so the
  // FirmwareView can warn that its phase is unconfirmed. The WS late-join
  // snapshot normally covers this — but if BOTH HTTP and WS are down, the
  // operator otherwise sees an apparently-idle page while a job may be in
  // flight server-side. Cleared by any later signal that the store has
  // live state again (successful fetch, WS snapshot, terminal transition).
  const currentJobLoadFailed = ref(false);

  // Cold-load resync. Mounted views call this to populate currentJob from
  // the server if a flash is already in flight (e.g., the operator refreshed
  // the page mid-flash). The WS late-join snapshot follows on connect; both
  // paths set the same data so applyJobStarted idempotency keeps state coherent.
  async function fetchCurrentJob(): Promise<void> {
    try {
      const response = await apiClient.get(FIRMWARE_FLASH);
      const body = response.data as FlashJobState | null;
      // Explicit non-empty-string check on body.jobId. A truthy
      // short-circuit would silently pass `{jobId: ''}` contract
      // violations through with no apply AND no warn; the forensic
      // warn below lets ops trace the bad payload back to its source.
      const hasValidJobId =
        body !== null && typeof body.jobId === 'string' && body.jobId.length > 0;
      if (body !== null && !hasValidJobId) {
        console.warn(
          `[firmwareStore] fetchCurrentJob: server returned non-null body with empty jobId — contract violation; skipping apply.`,
          body,
        );
      }
      // Mirror server-side decideLateJoinSnapshot: a job with endedAt is in
      // the reboot-wait window. The server will NOT emit a subsequent
      // flashJobStarted on the WS, so populating the store here would
      // wedge phase at 'flashing' indefinitely until the next refresh.
      if (hasValidJobId && body.endedAt === undefined && currentJob.value === null) {
        applyJobStarted(body);
      } else if (hasValidJobId && body.endedAt !== undefined) {
        console.info(
          `[firmwareStore] fetchCurrentJob: server returned job in reboot-wait window ` +
            `(jobId="${body.jobId}", endedAt="${body.endedAt}"). Skipping apply to avoid wedge.`,
        );
      }
      currentJobLoadFailed.value = false;
    } catch (error) {
      console.warn('firmware.fetchCurrentJob failed', error);
      // The server's healthy-idle response is 200 + body:null, handled in
      // the try block above. The 404 check below is forward-compat only: no
      // current server route returns 404 on this endpoint, but a future
      // change should not flip the staleness banner on for a benign idle
      // response. Treat 5xx and network-level failures as the staleness
      // signal; treat 404 (if it ever appears) as "no flash, not stale."
      const status =
        typeof error === 'object' && error !== null && 'response' in error
          ? (error as { response?: { status?: number } }).response?.status
          : undefined;
      currentJobLoadFailed.value = status !== 404;
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

  /**
   * POST a firmware binary to the server's upload slot. The server validates
   * the esp_app_desc header (project name, version) before promoting the
   * artifact; only a successful response sets `uploadedFile`, which is what
   * `canFlash` gates on. A filename in `uploadedFilename` is cosmetic — used
   * only by the source strip eyebrow to surface "you picked X, uploading…"
   * while the request is in flight.
   *
   * Failures route through the existing `flashError` envelope so the panel's
   * error banner renders uniformly. The server returns three error reasons:
   *   - `invalid_firmware` (400): bad project name / unparseable version
   *   - `upload_io_failed` (500): could not stage the temp file
   *   - `upload_persist_failed` (500): store() failed at the persist step
   */
  async function uploadFirmware(file: File): Promise<void> {
    uploadState.value = 'uploading';
    uploadedFile.value = null;
    uploadedFilename.value = file.name;
    clearFlashError();

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await apiClient.post(FIRMWARE_UPLOAD, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const body = response.data as FirmwareUploadResponse;
      uploadedFile.value = {
        version: body.meta.version,
        displayName: body.meta.originalFilename,
        sizeBytes: body.meta.sizeBytes,
      };
      uploadState.value = 'uploaded';
    } catch (error) {
      console.warn('firmware.uploadFirmware failed', error);
      uploadState.value = 'error';
      // Re-use the existing flashError surface so the panel banner renders
      // uniformly with flash-time HTTP failures.
      setFlashError(mapHttpErrorToFlashEnvelope(error));
    }
  }

  /**
   * Reset the upload slot. Operator-driven (the source strip's "Remove"
   * button calls this). Cleans the local filename, server-acknowledged
   * metadata, and any error envelope. Does NOT issue a DELETE to the server
   * — the server's slot is overwritten on the next successful upload, and
   * the unused artifact doesn't affect the flash flow.
   */
  function clearUpload(): void {
    uploadedFilename.value = null;
    uploadedFile.value = null;
    uploadState.value = 'idle';
    if (flashError.value !== null) clearFlashError();
  }

  // Project the controllerStates Map into the shape the panel expects.
  // `stageLabelKey` is an i18n key path (e.g. firmware_view.stages.transfer.label)
  // that the row component resolves via t() — keeps localization out of the
  // store and prevents the raw lowercase stage values from leaking to the UI.
  const progressByControllerId = computed(() => {
    const out: Partial<
      Record<
        SlotId,
        {
          status: ReturnType<typeof controllerStatePillKind>;
          stageLabelKey?: FirmwareStageLabelKey;
        }
      >
    > = {};
    for (const [id, state] of controllerStates.value) {
      out[id] = { status: controllerStatePillKind(state) };
      const key = controllerStageLabelKey(state);
      if (key !== null) {
        out[id]!.stageLabelKey = key;
      }
    }
    return out;
  });

  // Integer percentage 0..100 for the serial-upload step. All controllers
  // share bytesSent during upload (single binary to the master — see
  // flash_orchestrator.ts onTransferBegun), so picking any one in
  // UPLOADING_TO_MASTER is sufficient. null falls through to the UI's
  // generic in-progress label.
  const downloadPercent = computed<number | null>(() => {
    for (const state of controllerStates.value.values()) {
      if (state.stage !== 'UPLOADING_TO_MASTER') continue;
      const total = state.totalBytes;
      const sent = state.bytesSent;
      if (typeof total !== 'number' || total <= 0) return null;
      if (typeof sent !== 'number') return null;
      // Clamp so a stale bytesSent overflow can't render as "117%".
      return Math.round(Math.max(0, Math.min(1, sent / total)) * 100);
    }
    return null;
  });

  return {
    releases,
    releasesLoadState,
    staleSince,
    sourceMode,
    selectedReleaseTag,
    uploadedFilename,
    uploadState,
    uploadedFile,
    controllers,
    selectedControllerIds,
    phase,
    currentStage,
    flashError,
    failedControllers,
    currentJob,
    controllerStates,
    ownJobId,
    pendingByMac,
    currentJobLoadFailed,
    target,
    allowDowngrade,
    anyDowngradeBlocked,
    anyFleetDowngrade,
    canFlash,
    isOwnJob,
    progressByControllerId,
    downloadPercent,
    toggle,
    selectAll,
    clear,
    setPhase,
    resetToSelect,
    dismissError,
    setFlashError,
    clearFlashError,
    applyJobStarted,
    applyControllerUpdate,
    applyControllerResult,
    applyJobDone,
    applyJobFailed,
    flushPendingForMac,
    startFlash,
    cancelFlash,
    fetchCurrentJob,
    fetchReleases,
    uploadFirmware,
    clearUpload,
  };
});
