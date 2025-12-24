<script setup lang="ts">

const props = defineProps<{
  script: {
    id: string;
    scriptName: string;
    description: string;
    deploymentStatus: Record<string, { value: string; date: string }>;
  };
  locations: string[];
}>();

defineEmits<{
  (e: 'editScript', id: string): void;
  (e: 'copyScript', id: string): void;
  (e: 'uploadScript', id: string): void;
  (e: 'runScript', id: string): void;
  (e: 'openDeleteModal', id: string, name: string): void;
}>();

function getUploadStatus(
  location: string
): { class: string; text: string } {
  const status = props.script.deploymentStatus[location];
  if (!status) {
    return { class: 'bg-gray-200', text: 'Not uploaded' };
  }

  switch (status.value) {
    case 'uploaded':
      return { class: 'bg-green-600 text-white', text: new Date(status.date).toLocaleString() };
    case 'uploading':
      return { class: 'bg-yellow-600 text-black', text: 'Uploading...' };
    case 'notUploaded':
    default:
      return { class: 'bg-red-900 text-white', text: 'Not uploaded' };
  }
}

</script>

<template>
  <tr>
    <div class="flex h-10 leading-10 flex-row border-b-2 border-black">
      <!-- Name and Description (clickable) -->
      <div class="cursor-pointer flex flex-row grow" @click="$emit('editScript', props.script.id)">
        <div class="text-lg basis-60 overflow-hidden text-ellipsis">{{ props.script.scriptName }}</div>
        <div class="grow overflow-hidden text-ellipsis">{{ props.script.description }}</div>
      </div>

      <!-- Upload Status Indicators -->
      <div v-for="location in locations" :key="`${props.script.id}_${location}`"
        class="text-center w-15 h-6 leading-6 border border-black m-1 tooltip" :class="getUploadStatus(location).class"
        :title="getUploadStatus(location).text">
        {{ location.charAt(0).toUpperCase() + location.slice(1) }}
      </div>

      <!-- Action Buttons -->
      <div class="flex flex-row ml-3">
        <button class="btn btn-ghost btn-sm text-lg px-1 mx-1" title="Copy"
          @click="$emit('copyScript', props.script.id)">
          <v-icon name="io-copy" />
        </button>
        <button class="btn btn-ghost btn-sm text-lg px-1 mx-1" title="Upload"
          @click="$emit('uploadScript', props.script.id)">
          <v-icon name="io-cloud-upload" />
        </button>
        <button class="btn btn-ghost btn-sm text-lg px-1 mx-1" title="Run" @click="$emit('runScript', props.script.id)">
          <v-icon name="io-play" />
        </button>
        <button class="btn btn-ghost btn-sm text-lg px-1 mx-1" title="Delete"
          @click="$emit('openDeleteModal', props.script.id, props.script.scriptName)">
          <v-icon name="io-trash-bin" />
        </button>
      </div>
    </div>
  </tr>
</template>