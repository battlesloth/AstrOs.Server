<script setup lang="ts">
import { type PropType } from 'vue';
import type { GpioChannel } from '@/models/controllers/modules/gpio/gpioChannel';

// Props
const props = defineProps({
  channel: {
    type: Object as PropType<GpioChannel>,
    required: true,
  },
  parentTestId: {
    type: String,
    required: true,
  },
});
</script>

<template>
  <div class="flex flex-wrap gap-4">
    <!-- First Row: Channel Label and Name Input -->
    <div class="flex items-center gap-4 min-w-87.5 grow">
      <div class="text-lg font-medium min-w-27.5">{{ $t('gpio.channel') }} {{ channel.channelNumber }}</div>
      <div class="grow">
        <input :data-testid="`${parentTestId}-gpio-ch-${channel.channelNumber}-name`" v-model="channel.channelName"
          placeholder="Name" class="input input-bordered input-sm w-full" />
      </div>
    </div>

    <!-- Second Row: Checkboxes -->
    <div class="flex items-center gap-4 min-w-87.5 grow">
      <div class="form-control w-30">
        <label class="label cursor-pointer justify-center gap-2">
          <input type="checkbox" :data-testid="`${parentTestId}-gpio-ch-${channel.channelNumber}-enabled`"
            v-model="channel.enabled" class="checkbox checkbox-sm" />
          <span class="label-text">{{ $t('gpio.enabled') }}</span>
        </label>
      </div>
      <div class="form-control w-37.5">
        <label class="label cursor-pointer justify-center gap-2">
          <input type="checkbox" :data-testid="`${parentTestId}-gpio-ch-${channel.channelNumber}-default-high`"
            v-model="channel.defaultHigh" class="checkbox checkbox-sm" />
          <span class="label-text">{{ $t('gpio.default_high') }}</span>
        </label>
      </div>
    </div>
  </div>
</template>
