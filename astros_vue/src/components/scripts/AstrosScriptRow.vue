<script setup lang="ts">
import { UploadStatus } from '@/enums/scripts/uploadStatus';
import type { DeploymentStatus } from '@/models/scripts/deploymentStatus';

const props = defineProps<{
  script: {
    id: string;
    scriptName: string;
    description: string;
    deploymentStatus: Record<string, DeploymentStatus>;
  };
  locations: string[];
}>();

defineEmits<{
  (e: 'edit', id: string): void;
  (e: 'copy', id: string): void;
  (e: 'upload', id: string): void;
  (e: 'run', id: string): void;
  (e: 'delete', id: string, name: string): void;
}>();

function getUploadStatus(location: string): { class: string; text: string } {
  const status = props.script.deploymentStatus[location];
  if (!status) {
    return { class: 'bg-gray-200', text: 'Not uploaded' };
  }

  switch (status.value) {
    case UploadStatus.uploaded:
      return {
        class: 'badge-success',
        text: status.date ? new Date(status.date).toLocaleString() : 'No date',
      };
    case UploadStatus.uploading:
      return { class: 'badge-warning', text: 'Uploading...' };
    case UploadStatus.NOT_UPLOADED:
      return { class: 'badge-error', text: 'Not uploaded' };
    default:
      return { class: 'badge-error', text: 'Not uploaded' };
  }
}
</script>

<template>
  <tr class="hover">
    <!-- Name -->
    <td
      class="min-w-[30ch] max-w-0 cursor-pointer"
      @click="$emit('edit', props.script.id)"
    >
      <div class="text-lg truncate">{{ props.script.scriptName }}</div>
    </td>

    <!-- Description -->
    <td
      class="max-w-0 cursor-pointer"
      @click="$emit('edit', props.script.id)"
    >
      <div
        class="text-lg truncate"
        :title="props.script.description"
      >
        {{ props.script.description }}
      </div>
    </td>

    <!-- Upload Status Indicators -->
    <td class="pr-0 pl-0">
      <div class="flex gap-1 justify-center">
        <div
          v-for="location in locations"
          :key="`${props.script.id}_${location}`"
          class="badge tooltip"
          :class="getUploadStatus(location).class"
          :data-tip="getUploadStatus(location).text"
        >
          {{ location.charAt(0).toUpperCase() + location.slice(1) }}
        </div>
      </div>
    </td>

    <!-- Action Buttons -->
    <td class="pr-2 pl-2">
      <div class="flex flex-row justify-end">
        <button
          class="btn btn-ghost btn-xs"
          title="Copy"
          @click="$emit('copy', props.script.id)"
        >
          <v-icon name="io-copy" />
        </button>
        <button
          class="btn btn-ghost btn-xs"
          title="Upload"
          @click="$emit('upload', props.script.id)"
        >
          <v-icon name="io-cloud-upload" />
        </button>
        <button
          class="btn btn-ghost btn-xs"
          title="Run"
          @click="$emit('run', props.script.id)"
        >
          <v-icon name="io-play" />
        </button>
        <button
          class="btn btn-ghost btn-xs"
          title="Delete"
          @click="$emit('delete', props.script.id, props.script.scriptName)"
        >
          <v-icon name="io-trash-bin" />
        </button>
      </div>
    </td>
  </tr>
</template>
