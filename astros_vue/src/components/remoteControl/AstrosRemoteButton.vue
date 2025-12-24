<script setup lang="ts">

defineProps<{
  currentScript: string;
  scripts: { id: string; name: string }[];
}>();

defineEmits<{
  (e: 'changed', value: string): void;
}>();

</script>

<template>
  <div class="bg-primary border-2 border-black rounded-xl p-5">
    <select :value="currentScript" @change="$emit('changed', ($event.target && ($event.target as HTMLSelectElement).value) || '')"
      class="select select-bordered w-full text-lg" title="Script">
      <option value="0">None</option>
      <option v-for="script in scripts" :key="script.id" :value="script.id">
        {{ script.name }}
      </option>
    </select>
  </div>
</template>