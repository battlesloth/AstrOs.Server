<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { storeToRefs } from 'pinia';
import { useFirmwareStore } from '@/stores/firmware';
import type { ReleaseInfo, FirmwareSourceMode } from '@/types/firmware';
import AstrosFirmwareButton from '../firmwareButton/AstrosFirmwareButton.vue';

const { t } = useI18n();
const firmware = useFirmwareStore();
const {
  releases,
  sourceMode,
  selectedReleaseTag,
  uploadedFilename,
  uploadState,
  uploadedFile,
  releasesLoadState,
  staleSince,
} = storeToRefs(firmware);

const fileInput = ref<HTMLInputElement | null>(null);

const selectedRelease = computed<ReleaseInfo | null>(
  () => releases.value.find((r) => r.tag === selectedReleaseTag.value) ?? null,
);

const latestNonPrereleaseTag = computed<string | null>(
  () => releases.value.find((r) => !r.prerelease)?.tag ?? null,
);

const dateFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });
const formatDate = (iso: string) => dateFormatter.format(new Date(iso));
const formatSize = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(2)} MB`;

function selectMode(mode: FirmwareSourceMode) {
  firmware.sourceMode = mode;
}

function onReleaseChange(event: Event) {
  const value = (event.target as HTMLSelectElement).value;
  firmware.selectedReleaseTag = value === '' ? null : value;
}

function onFilePick(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file) return;
  // Fire-and-forget — the store transitions through uploadState and the
  // template reactively renders the in-progress / success / error states.
  // Errors route through the flashError envelope which the panel banner
  // already renders, so we don't need to await + handle here.
  void firmware.uploadFirmware(file);
}

function clearUploadedFile() {
  firmware.clearUpload();
  if (fileInput.value) fileInput.value.value = '';
}

function releaseOptionLabel(r: ReleaseInfo): string {
  if (r.tag === latestNonPrereleaseTag.value) {
    return `${r.tag} ${t('firmware_view.source.release_option_latest_suffix')}`;
  }
  if (r.prerelease) {
    return `${r.tag} ${t('firmware_view.source.release_option_prerelease_suffix')}`;
  }
  return r.tag;
}

const primaryAssetSize = computed<number | null>(() => {
  const assets = selectedRelease.value?.assets;
  if (!assets || assets.length === 0) return null;
  return assets[0]?.sizeBytes ?? null;
});
</script>

<template>
  <div class="astros-firmware-source-strip">
    <div
      class="astros-firmware-source-strip__toggle"
      role="group"
      :aria-label="$t('firmware_view.source.toggle_aria')"
    >
      <button
        type="button"
        :aria-pressed="sourceMode === 'github'"
        :class="[
          'astros-firmware-source-strip__toggle-segment',
          { 'is-active': sourceMode === 'github' },
        ]"
        @click="selectMode('github')"
      >
        {{ $t('firmware_view.source.toggle_github') }}
      </button>
      <button
        type="button"
        :aria-pressed="sourceMode === 'upload'"
        :class="[
          'astros-firmware-source-strip__toggle-segment',
          { 'is-active': sourceMode === 'upload' },
        ]"
        @click="selectMode('upload')"
      >
        {{ $t('firmware_view.source.toggle_upload') }}
      </button>
    </div>

    <div class="astros-firmware-source-strip__middle">
      <template v-if="sourceMode === 'github'">
        <span class="astros-firmware-source-strip__eyebrow">{{
          $t('firmware_view.source.eyebrow_release')
        }}</span>

        <template v-if="selectedRelease">
          <div class="astros-firmware-source-strip__detail-row">
            <span class="astros-firmware-source-strip__tag">{{ selectedRelease.tag }}</span>
            <span
              v-if="selectedRelease.tag === latestNonPrereleaseTag"
              class="astros-firmware-source-strip__pill astros-firmware-source-strip__pill--latest"
            >
              {{ $t('firmware_view.source.tag_pill_latest') }}
            </span>
            <span
              v-else-if="selectedRelease.prerelease"
              class="astros-firmware-source-strip__pill astros-firmware-source-strip__pill--prerelease"
            >
              {{ $t('firmware_view.source.tag_pill_prerelease') }}
            </span>
          </div>
          <div class="astros-firmware-source-strip__meta">
            <span>{{ formatDate(selectedRelease.publishedAt) }}</span>
            <span v-if="primaryAssetSize !== null">· {{ formatSize(primaryAssetSize) }}</span>
          </div>
        </template>
        <span
          v-else
          class="astros-firmware-source-strip__detail-empty"
          >{{
            releasesLoadState === 'loading'
              ? $t('firmware_view.source.releases_loading')
              : $t('firmware_view.source.no_release_selected')
          }}</span
        >

        <p
          v-if="releasesLoadState === 'stale' && staleSince"
          class="astros-firmware-source-strip__warning astros-firmware-source-strip__warning--stale"
          role="status"
        >
          {{ $t('firmware_view.source.releases_stale_warning', { since: formatDate(staleSince) }) }}
        </p>
        <p
          v-else-if="releasesLoadState === 'error'"
          class="astros-firmware-source-strip__warning astros-firmware-source-strip__warning--error"
          role="alert"
        >
          {{ $t('firmware_view.source.releases_load_error') }}
        </p>
      </template>

      <template v-else>
        <span class="astros-firmware-source-strip__eyebrow">{{
          $t('firmware_view.source.eyebrow_file')
        }}</span>
        <!--
          Three display states, in priority order:
          1. `uploadState === 'uploaded'` — show server-acknowledged version
             + size (the operator can confirm the right artifact landed).
          2. `uploadState === 'uploading'` — show operator's filename +
             "Uploading…" line so they know the request is in flight.
          3. else — show the operator's filename if a pick is in progress
             OR has errored, otherwise the "no file selected" placeholder.
             Error-detail copy is in the panel's flash-error banner; no
             duplicate surface here.
        -->
        <template v-if="uploadState === 'uploaded' && uploadedFile">
          <span class="astros-firmware-source-strip__filename">{{ uploadedFile.displayName }}</span>
          <div class="astros-firmware-source-strip__meta">
            <span>v{{ uploadedFile.version }}</span>
            <span>· {{ formatSize(uploadedFile.sizeBytes) }}</span>
          </div>
        </template>
        <template v-else-if="uploadState === 'uploading'">
          <span class="astros-firmware-source-strip__filename">{{ uploadedFilename }}</span>
          <span
            class="astros-firmware-source-strip__detail-empty"
            role="status"
            aria-live="polite"
            >{{ $t('firmware_view.source.uploading') }}</span
          >
        </template>
        <template v-else-if="uploadedFilename">
          <span class="astros-firmware-source-strip__filename">{{ uploadedFilename }}</span>
        </template>
        <span
          v-else
          class="astros-firmware-source-strip__detail-empty"
          >{{ $t('firmware_view.source.no_file_selected') }}</span
        >
      </template>
    </div>

    <div class="astros-firmware-source-strip__right">
      <template v-if="sourceMode === 'github'">
        <label
          for="astros-firmware-source-strip-release-select"
          class="sr-only"
        >
          {{ $t('firmware_view.source.label_select_release') }}
        </label>
        <select
          id="astros-firmware-source-strip-release-select"
          class="astros-firmware-source-strip__release-select"
          :value="selectedReleaseTag ?? ''"
          :disabled="releases.length === 0"
          @change="onReleaseChange"
        >
          <option
            value=""
            disabled
          >
            —
          </option>
          <option
            v-for="r in releases"
            :key="r.tag"
            :value="r.tag"
          >
            {{ releaseOptionLabel(r) }}
          </option>
        </select>
      </template>

      <template v-else>
        <input
          ref="fileInput"
          type="file"
          accept=".bin"
          hidden
          :aria-label="$t('firmware_view.source.label_upload_file')"
          @change="onFilePick"
        />
        <!--
          Browse-files button shows when there's nothing in flight or staged.
          Disabled mid-upload so a second pick can't race the in-flight POST.
          Once the upload errors or succeeds, the right column becomes
          the "Remove" / clear affordance (operator can re-pick after that).
        -->
        <AstrosFirmwareButton
          v-if="!uploadedFilename"
          kind="secondary"
          @click="fileInput?.click()"
        >
          {{ $t('firmware_view.source.browse_files') }}
        </AstrosFirmwareButton>
        <AstrosFirmwareButton
          v-else
          kind="ghost"
          :disabled="uploadState === 'uploading'"
          @click="clearUploadedFile"
        >
          {{ $t('firmware_view.source.remove') }}
        </AstrosFirmwareButton>
      </template>
    </div>
  </div>
</template>

<style scoped>
.astros-firmware-source-strip {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px;
  border-radius: 6px;
  background: #0e1726; /* ASTROS.ink */
  color: #dde6ee;
  font-family: 'Inter', system-ui, sans-serif;
}

/* Pill segmented toggle */
.astros-firmware-source-strip__toggle {
  display: inline-flex;
  background: rgba(255, 255, 255, 0.06);
  border-radius: 4px;
  padding: 3px;
  flex-shrink: 0;
}

.astros-firmware-source-strip__toggle-segment {
  appearance: none;
  border: none;
  background: transparent;
  color: #a8b8c4;
  font-family: inherit;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  padding: 6px 14px;
  border-radius: 3px;
  cursor: pointer;
  transition:
    background 0.15s linear,
    color 0.15s linear;
}

.astros-firmware-source-strip__toggle-segment.is-active {
  background: #fff;
  color: #0e1726;
}

.astros-firmware-source-strip__toggle-segment:focus-visible {
  outline: 2px solid #7d92b8;
  outline-offset: 2px;
}

.astros-firmware-source-strip__middle {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.astros-firmware-source-strip__eyebrow {
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: #7d92b8;
}

.astros-firmware-source-strip__detail-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.astros-firmware-source-strip__tag {
  font-size: 17px;
  font-weight: 700;
  font-family: ui-monospace, 'SF Mono', monospace;
  color: #fff;
}

.astros-firmware-source-strip__pill {
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  padding: 2px 6px;
  border-radius: 3px;
  color: #fff;
}

.astros-firmware-source-strip__pill--latest {
  background: #3aa676;
}

.astros-firmware-source-strip__pill--prerelease {
  background: #e5a93a;
}

.astros-firmware-source-strip__meta {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: #a8b8c4;
}

.astros-firmware-source-strip__filename {
  font-size: 13px;
  font-family: ui-monospace, 'SF Mono', monospace;
  color: #fff;
}

.astros-firmware-source-strip__detail-empty {
  font-size: 13px;
  color: #a8b8c4;
}

.astros-firmware-source-strip__warning {
  font-size: 11px;
  margin: 4px 0 0 0;
  font-weight: 500;
}

.astros-firmware-source-strip__warning--stale {
  color: #e5a93a;
}

.astros-firmware-source-strip__warning--error {
  color: #cf4242;
}

.astros-firmware-source-strip__right {
  flex-shrink: 0;
}

.astros-firmware-source-strip__release-select {
  font-family: ui-monospace, 'SF Mono', monospace;
  font-size: 12px;
  min-width: 180px;
  padding: 6px 10px;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.06);
  color: #fff;
  border: 1px solid rgba(255, 255, 255, 0.15);
}

.astros-firmware-source-strip__release-select:focus-visible {
  outline: 2px solid #7d92b8;
  outline-offset: 2px;
}

/* The open dropdown's options are rendered by the OS/browser native popup,
   not the dark strip. Without explicit option styling they inherit the
   select's white text and pair it with the OS default white background —
   white-on-white. Force dark text on white so options are readable when
   the dropdown is open, regardless of OS theme. */
.astros-firmware-source-strip__release-select option {
  color: #0e1726; /* ink */
  background: #fff;
}
</style>
