<script lang="ts" setup>
const filter = defineModel<string>({
  default: '',
  type: String,
});

defineEmits<{
  (event: 'enter'): void;
}>();
</script>

<template>
  <div>
    <label class="input w-full">
      <v-icon
        name="io-search"
        class="opacity-50"
      />
      <input
        v-model="filter"
        type="text"
        :placeholder="$t('placeholder.filter')"
        @keydown.enter="$emit('enter')"
        required
        aria-label="filter"
      />
    </label>
  </div>
</template>
