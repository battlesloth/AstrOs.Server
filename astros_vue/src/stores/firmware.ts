import { ref } from 'vue';
import { defineStore } from 'pinia';
import apiService from '@/api/apiService';
import { FIRMWARE_RELEASES } from '@/api/endpoints';
import type {
  FirmwareSourceMode,
  ReleaseInfo,
  ReleaseListResult,
  ReleasesLoadState,
} from '@/types/firmware';

// d.2 subset of the firmware view's UI state. Other fields described in
// the umbrella plan (currentJob, controllerStates, phase, etc.) land in
// d.5/d.6 when the WS dispatcher and flash POST arrive.
export const useFirmwareStore = defineStore('firmware', () => {
  // Server-pushed
  const releases = ref<ReleaseInfo[]>([]);
  const releasesLoadState = ref<ReleasesLoadState>('idle');
  const staleSince = ref<string | null>(null);

  // User selection
  const sourceMode = ref<FirmwareSourceMode>('github');
  const selectedReleaseVersion = ref<string | null>(null);
  const uploadedFilename = ref<string | null>(null);

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
    selectedReleaseVersion,
    uploadedFilename,
    fetchReleases,
  };
});
