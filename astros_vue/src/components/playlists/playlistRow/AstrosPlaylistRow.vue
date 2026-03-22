<script lang="ts" setup>
const props = defineProps<{
  playlist: {
    id: string;
    playlistName: string;
    description: string;
  };
}>();

defineEmits<{
  (e: 'edit', id: string): void;
  (e: 'copy', id: string): void;
  (e: 'play', id: string): void;
  (e: 'delete', id: string): void;
}>();
</script>

<template>
  <tr class="hover">
    <!-- Name -->
    <td
      class="min-w-[30ch] max-w-0 cursor-pointer"
      @click="$emit('edit', props.playlist.id)"
    >
      <div class="text-lg truncate">{{ props.playlist.playlistName }}</div>
    </td>

    <!-- Description -->
    <td
      class="max-w-0 cursor-pointer"
      @click="$emit('edit', props.playlist.id)"
    >
      <div class="truncate">{{ props.playlist.description }}</div>
    </td>
    <!-- Action Buttons -->
    <td class="flex flex-row justify-end">
      <button
        class="btn btn-ghost btn-xs"
        title="Copy"
        @click="$emit('copy', props.playlist.id)"
      >
        <v-icon name="io-copy" />
      </button>
      <button
        class="btn btn-ghost btn-xs"
        title="Play"
        @click="$emit('play', props.playlist.id)"
      >
        <v-icon name="io-play" />
      </button>
      <button
        class="btn btn-ghost btn-xs"
        title="Delete"
        @click="$emit('delete', props.playlist.id)"
      >
        <v-icon name="io-trash-bin" />
      </button>
    </td>
  </tr>
</template>
