<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import type { RemoteControlPage } from '@/models/remoteControl/remoteControlPage';
import AstrosMobileRemote from '@/components/mobileRemote/mobileRemote/AstrosMobileRemote.vue';

const { t } = useI18n();

defineProps<{
  pages: readonly RemoteControlPage[];
  selectedIdx: number;
}>();

// No emits. The embedded AstrosMobileRemote will fire press/panic from
// internal button clicks; we attach empty handlers to satisfy Vue's event
// binding and explicitly NOT re-emit (Decision 1: live preview is read-only,
// avoids the "I clicked a button in the editor and the droid moved" surprise).
function noopPress() {
  /* read-only preview — see Decision 1 in the design spec */
}
function noopPanic() {
  /* read-only preview — see Decision 1 in the design spec */
}
</script>

<template>
  <div
    class="astros-remote-live-preview"
    :aria-label="t('remote_control_config.preview.bezel_label')"
    data-testid="preview-bezel"
  >
    <div class="astros-remote-live-preview__bezel">
      <AstrosMobileRemote
        :pages="pages as RemoteControlPage[]"
        :initial-idx="selectedIdx"
        :compact="true"
        :connected="true"
        @press="noopPress"
        @panic="noopPanic"
      />
    </div>
  </div>
</template>

<style scoped>
/* MiniPhone bezel — presentational chrome around the embedded remote.
 * Width matches the design spec's "~280px" right-rail target; height clamps
 * to a phone-ish aspect so the bezel doesn't stretch on tall viewports. */
.astros-remote-live-preview {
  display: flex;
  flex-shrink: 0;
  align-items: flex-start;
  justify-content: center;
  width: 280px;
  padding: 16px 12px;
}

.astros-remote-live-preview__bezel {
  position: relative;
  display: flex;
  width: 224px;
  height: 440px;
  overflow: hidden;
  background: #1a1f29;
  border: 6px solid #0e1726;
  border-radius: 28px;
  box-shadow:
    0 4px 14px rgba(14, 23, 38, 0.35),
    inset 0 0 0 2px rgba(255, 255, 255, 0.04);
}

/* Tiny inset so the embedded mobile remote's white background reads as a
 * phone screen behind the bezel rather than bleeding to the bezel edge.
 * NOTE: this :deep selector couples to AstrosMobileRemote's root BEM class —
 * if that class renames, this rule silently stops applying (visual-only). */
.astros-remote-live-preview__bezel :deep(.astros-mobile-remote) {
  border-radius: 18px;
}
</style>
