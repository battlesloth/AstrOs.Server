<script setup lang="ts">
import { computed, ref } from 'vue';
import type { PlaylistSettings } from '@/models/playlists/playlistSettings';
import { PlaylistType } from '@/enums/playlists/playlistType';

const props = defineProps<{
  playlistType: PlaylistType;
}>();

const modelValue = defineModel<PlaylistSettings>({
  required: true,
});

const delayEnabled = computed(() =>
  [PlaylistType.ShuffleWithDelay, PlaylistType.ShuffleWithDelayAndRepeat].includes(
    props.playlistType,
  ),
);

const repeatEnabled = computed(() =>
  [
    PlaylistType.SequentialRepeatable,
    PlaylistType.ShuffleWithRepeat,
    PlaylistType.ShuffleWithDelayAndRepeat,
  ].includes(props.playlistType),
);

function initRepeatMode(): 'none' | 'count' | 'infinite' {
  if (!modelValue.value.repeat) return 'none';
  return modelValue.value.repeatCount === -1 ? 'infinite' : 'count';
}

const repeatMode = ref<'none' | 'count' | 'infinite'>(initRepeatMode());

function onRepeatModeChange(mode: 'none' | 'count' | 'infinite') {
  repeatMode.value = mode;
  if (mode === 'none') {
    modelValue.value.repeat = false;
  } else if (mode === 'infinite') {
    modelValue.value.repeat = true;
    modelValue.value.repeatCount = -1;
  } else {
    modelValue.value.repeat = true;
    if (modelValue.value.repeatCount < 0) modelValue.value.repeatCount = 1;
  }
}

function onRepeatCountChange(e: Event) {
  const val = parseInt((e.target as HTMLInputElement).value, 10);
  if (!isNaN(val) && val > 0) modelValue.value.repeatCount = val;
}

const delayMinDisplay = computed(() => (Math.round(modelValue.value.delayMin) / 10).toFixed(1));

const delayMaxDisplay = computed(() => (Math.round(modelValue.value.delayMax) / 10).toFixed(1));

function setDelayMin(e: Event) {
  const val = parseFloat((e.target as HTMLInputElement).value);
  if (!isNaN(val) && val >= 0) {
    modelValue.value.delayMin = Math.round(val * 10);
    if (modelValue.value.delayMax < modelValue.value.delayMin) {
      modelValue.value.delayMax = modelValue.value.delayMin;
    }
  }
}

function setDelayMax(e: Event) {
  const val = parseFloat((e.target as HTMLInputElement).value);
  if (!isNaN(val) && val >= 0) {
    let ds = Math.round(val * 10);
    if (ds < modelValue.value.delayMin) {
      ds = modelValue.value.delayMin;
    }
    modelValue.value.delayMax = ds;
  }
}
</script>

<template>
  <div class="flex flex-row justify-between gap-2">
    <div class="flex flex-row flex-wrap items-center gap-2">
      <label class="label cursor-pointer gap-2">
        <span class="label-text whitespace-nowrap">Random Delay</span>
        <input
          type="checkbox"
          v-model="modelValue.randomDelay"
          :disabled="!delayEnabled"
          class="checkbox checkbox-sm"
        />
      </label>
      <div class="flex flex-row items-center gap-2">
        <label class="label">
          <span class="label-text whitespace-nowrap">{{
            modelValue.randomDelay ? 'Min Delay' : 'Delay'
          }}</span>
        </label>
        <input
          type="number"
          step="0.1"
          min="0"
          :value="delayMinDisplay"
          @change="setDelayMin"
          :disabled="!delayEnabled"
          class="input input-bordered input-sm w-17"
        />
        <label
          v-if="modelValue.randomDelay"
          class="label"
        >
          <span class="label-text whitespace-nowrap">Max Delay</span>
        </label>
        <input
          v-if="modelValue.randomDelay"
          type="number"
          step="0.1"
          min="0"
          :value="delayMaxDisplay"
          @change="setDelayMax"
          :disabled="!delayEnabled"
          class="input input-bordered input-sm w-17"
        />
      </div>
    </div>
    <div class="flex flex-row flex-wrap items-center gap-2">
      <select
        :value="repeatMode"
        @change="
          onRepeatModeChange(
            ($event.target as HTMLSelectElement).value as 'none' | 'count' | 'infinite',
          )
        "
        :disabled="!repeatEnabled"
        class="select select-sm select-bordered w-40"
      >
        <option value="none">Repeat - None</option>
        <option value="count">Repeat - Count</option>
        <option value="infinite">Repeat - Infinite</option>
      </select>
      <input
        type="number"
        placeholder="Count"
        min="1"
        step="1"
        :value="modelValue.repeatCount > 0 ? modelValue.repeatCount : ''"
        @change="onRepeatCountChange"
        :disabled="!repeatEnabled || repeatMode !== 'count'"
        class="input input-bordered input-sm w-17"
      />
    </div>
  </div>
</template>
