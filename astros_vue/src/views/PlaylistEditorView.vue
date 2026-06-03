<script setup lang="ts">
import AstrosLayout from '@/components/common/layout/AstrosLayout.vue';
import AstrosPlaylistEditor from '@/components/playlists/playlistEditor/AstrosPlaylistEditor.vue';
</script>

<template>
  <AstrosLayout>
    <template v-slot:main>
      <AstrosPlaylistEditor />
    </template>
  </AstrosLayout>
</template>
