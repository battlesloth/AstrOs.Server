<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { makeNoneButton, type PageButton } from '@/models/remoteControl/pageButton';
import { assertNever } from '@/utils/assertNever';

const { t } = useI18n();

const props = defineProps<{
  value: PageButton;
}>();

// The editor is now a view-owned modal (AstrosRemoteButtonEditorModal); this
// card is presentational. `edit` asks the view to open the editor for this
// slot; `change` is the direct Clear action (no modal needed).
const emit = defineEmits<{
  change: [value: PageButton];
  edit: [];
}>();

const isAssigned = computed(() => props.value.type !== 'none');

// Switch (not ternary) so a new PageButtonType variant breaks the build here
// and forces both chip styling and chip labelling to be updated explicitly.
const typeChipClasses = computed(() => {
  switch (props.value.type) {
    case 'playlist':
      // Matches the mobile-remote playlist chip: --mr-complement (#f49446) bg +
      // black text. `bg-r2-complement` forces that exact pair via styles.css.
      return 'bg-r2-complement';
    case 'script':
      // Matches the mobile-remote filled button: --mr-primary (#2a5a97) + white.
      return 'bg-primary text-white';
    case 'none':
      return '';
    default:
      return assertNever(props.value.type);
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
    default:
      return assertNever(props.value.type);
  }
});

function clearAssignment() {
  emit('change', makeNoneButton());
}
</script>

<template>
  <div
    class="astros-remote-button-card flex min-h-32 flex-col gap-2 rounded-xl p-3 transition-colors"
    :class="
      isAssigned
        ? 'bg-r2-xlight'
        : 'border-2 border-base-300 bg-base-100 hover:border-base-content/30'
    "
  >
    <div
      v-if="isAssigned"
      class="flex justify-center"
    >
      <span
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
          class="btn btn-sm btn-primary flex-1"
          data-testid="card-edit"
          @click="emit('edit')"
        >
          {{ t('remote_control_config.card.edit') }}
        </button>
        <button
          type="button"
          class="btn btn-sm btn-primary flex-1"
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
        @click="emit('edit')"
      >
        {{ t('remote_control_config.card.configure') }}
      </button>
    </template>
  </div>
</template>
