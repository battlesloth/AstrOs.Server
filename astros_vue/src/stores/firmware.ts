import { computed, ref, watch } from 'vue';
import { defineStore } from 'pinia';
import apiService, { apiClient } from '@/api/apiService';
import { FIRMWARE_FLASH, FIRMWARE_RELEASES } from '@/api/endpoints';
import { compareTags } from '@/utils/version';
import { mapHttpErrorToFlashEnvelope } from '@/utils/firmwareFlashError';
import type {
  FirmwareControllerView,
  FirmwarePhase,
  FirmwareSourceMode,
  FirmwareStage,
  FlashErrorEnvelope,
  ReleaseInfo,
  ReleaseListResult,
  ReleasesLoadState,
} from '@/types/firmware';

export const useFirmwareStore = defineStore('firmware', () => {
  const releases = ref<ReleaseInfo[]>([]);
  const releasesLoadState = ref<ReleasesLoadState>('idle');
  const staleSince = ref<string | null>(null);

  const sourceMode = ref<FirmwareSourceMode>('github');
  const selectedReleaseTag = ref<string | null>(null);
  const uploadedFilename = ref<string | null>(null);

  const controllers = ref<FirmwareControllerView[]>([]);
  const selectedControllerIds = ref<ReadonlySet<string>>(new Set());

  const phase = ref<FirmwarePhase>('idle');
  const currentStage = ref<FirmwareStage | null>(null);
  const flashError = ref<FlashErrorEnvelope | null>(null);
  const failedController = ref<{ id: string; label: string; stage: FirmwareStage } | null>(null);

  // Reconcile selection against the fleet — when `controllers` is reassigned
  // (e.g. by a WS-driven refresh), prune any selected ids that no longer
  // refer to a known controller. Prevents orphan ids from silently passing
  // `canFlash` (size > 0) and skipping the downgrade check (find returns
  // undefined → not blocked).
  watch(controllers, (next) => {
    if (selectedControllerIds.value.size === 0) return;
    const known = new Set(next.map((c) => c.id));
    const filtered = new Set<string>();
    for (const id of selectedControllerIds.value) {
      if (known.has(id)) filtered.add(id);
    }
    if (filtered.size !== selectedControllerIds.value.size) {
      selectedControllerIds.value = filtered;
    }
  });

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
  }

  function dismissError(): void {
    flashError.value = null;
  }

  async function startFlash(): Promise<void> {
    if (!canFlash.value || phase.value === 'flashing') return;
    flashError.value = null;
    const body =
      sourceMode.value === 'github'
        ? { source: { kind: 'github' as const, version: selectedReleaseTag.value } }
        : { source: { kind: 'upload' as const } };
    phase.value = 'flashing';
    try {
      await apiService.post(FIRMWARE_FLASH, body);
      // HTTP 200 means orchestrator.start() resolved synchronously. Subsequent
      // state (per-controller stages, completion, failure) is owned by the WS
      // dispatcher in d.6. In d.5 we remain in 'flashing' until the operator
      // dismisses the view; this is the documented d.5 behavior.
    } catch (error) {
      phase.value = 'select';
      flashError.value = mapHttpErrorToFlashEnvelope(error);
    }
  }

  async function cancelFlash(reason: string = 'operator'): Promise<void> {
    try {
      await apiClient.delete(FIRMWARE_FLASH, { data: { reason } });
    } catch (error) {
      // Cancel is best-effort. A failure here is logged but doesn't transition
      // phase — the WS dispatcher in d.6 owns post-cancel state truth.
      console.warn('firmware.cancelFlash failed', error);
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
    target,
    anyDowngradeBlocked,
    canFlash,
    toggle,
    selectAll,
    clear,
    setPhase,
    resetToSelect,
    dismissError,
    startFlash,
    cancelFlash,
    fetchReleases,
  };
});
