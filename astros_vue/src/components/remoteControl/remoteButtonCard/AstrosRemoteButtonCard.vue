<script setup lang="ts">
import { computed, onMounted, onScopeDispose, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { autoUpdate, flip, offset, shift, useFloating } from '@floating-ui/vue';
import { NONE_BUTTON, type PageButton } from '@/models/remoteControl/pageButton';
import type { EditorListItem } from '../remoteButtonEditor/types';
import AstrosRemoteButtonEditor from '../remoteButtonEditor/AstrosRemoteButtonEditor.vue';

const { t } = useI18n();

const props = defineProps<{
  buttonNumber: number;
  value: PageButton;
  scripts: readonly EditorListItem[];
  playlists: readonly EditorListItem[];
}>();

const emit = defineEmits<{
  change: [value: PageButton];
}>();

const isAssigned = computed(() => props.value.type !== 'none');

// Switch (not ternary) so a new PageButtonType variant breaks the build here
// and forces both chip styling and chip labelling to be updated explicitly.
const typeChipClasses = computed(() => {
  switch (props.value.type) {
    case 'playlist':
      return 'bg-warning/15 text-warning-content border border-warning/40';
    case 'script':
      return 'bg-primary/15 text-primary border border-primary/40';
    case 'none':
      return '';
    default: {
      const _exhaustive: never = props.value.type;
      return _exhaustive;
    }
  }
});

const typeChipLabel = computed(() => {
  switch (props.value.type) {
    case 'script':
      return t('remote_control_config.card.type_script');
    case 'playlist':
      return t('remote_control_config.card.type_playlist');
    case 'none':
      return '';
    default: {
      const _exhaustive: never = props.value.type;
      return _exhaustive;
    }
  }
});

const popoverOpen = ref(false);
const cardRef = ref<HTMLElement | null>(null);
const popoverRef = ref<HTMLElement | null>(null);

const { floatingStyles } = useFloating(cardRef, popoverRef, {
  placement: 'bottom',
  middleware: [offset(8), flip(), shift({ padding: 8 })],
  whileElementsMounted: autoUpdate,
});

function openEditor() {
  popoverOpen.value = true;
}

function closeEditor() {
  popoverOpen.value = false;
}

function handleChange(value: PageButton) {
  emit('change', value);
  closeEditor();
}

function clearAssignment() {
  emit('change', NONE_BUTTON);
}

function handleClickOutside(e: MouseEvent) {
  if (!popoverOpen.value) return;
  // composedPath walks through Shadow DOM boundaries too, so a future
  // shadow-hosted child of the popover wouldn't get treated as "outside."
  const path = e.composedPath();
  if (cardRef.value && path.includes(cardRef.value)) return;
  if (popoverRef.value && path.includes(popoverRef.value)) return;
  closeEditor();
}

onMounted(() => {
  // Capture phase as a defensive default — guarantees this fires regardless
  // of whether future child handlers stop propagation.
  document.addEventListener('click', handleClickOutside, true);
});

// onScopeDispose (not onBeforeUnmount) so the listener is also torn down on
// non-standard teardown paths (parent throws mid-render, Suspense cancels a
// pending mount after onMounted already fired). Same pattern used by the
// mobileRemote composables.
onScopeDispose(() => {
  document.removeEventListener('click', handleClickOutside, true);
});
</script>

<template>
  <div
    ref="cardRef"
    class="astros-remote-button-card flex min-h-32 flex-col gap-2 rounded-xl border-2 p-3 transition-colors"
    :class="
      isAssigned
        ? 'border-primary bg-primary/5'
        : 'border-base-300 bg-base-100 hover:border-base-content/30'
    "
  >
    <div class="flex items-center justify-between">
      <span class="text-[10px] font-bold uppercase tracking-[0.1em] text-base-content/60">
        {{ t('remote_control_config.card.label', { n: buttonNumber }) }}
      </span>
      <span
        v-if="isAssigned"
        :class="[
          'rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider',
          typeChipClasses,
        ]"
        data-testid="card-type-chip"
      >
        {{ typeChipLabel }}
      </span>
    </div>

    <template v-if="isAssigned">
      <div class="flex-1 text-center text-sm font-semibold leading-tight">{{ value.name }}</div>
      <div class="flex gap-2">
        <button
          type="button"
          class="btn btn-sm btn-outline flex-1"
          data-testid="card-edit"
          @click="openEditor"
        >
          {{ t('remote_control_config.card.edit') }}
        </button>
        <button
          type="button"
          class="btn btn-sm btn-ghost flex-1"
          data-testid="card-clear"
          @click="clearAssignment"
        >
          {{ t('remote_control_config.card.clear') }}
        </button>
      </div>
    </template>
    <template v-else>
      <button
        type="button"
        class="btn btn-sm btn-ghost mt-auto w-full justify-center text-base-content/60"
        data-testid="card-configure"
        @click="openEditor"
      >
        {{ t('remote_control_config.card.configure') }}
      </button>
    </template>
  </div>

  <Teleport to="body">
    <div
      v-if="popoverOpen"
      ref="popoverRef"
      :style="floatingStyles"
      class="z-50 w-64 rounded-xl border-2 border-primary bg-base-100 p-3 shadow-xl"
    >
      <AstrosRemoteButtonEditor
        :button-number="buttonNumber"
        :current-value="value"
        :scripts="scripts"
        :playlists="playlists"
        @change="handleChange"
        @close="closeEditor"
      />
    </div>
  </Teleport>
</template>
