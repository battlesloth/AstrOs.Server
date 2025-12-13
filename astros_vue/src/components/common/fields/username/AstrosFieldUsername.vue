<script lang="ts" setup>
const username = defineModel<string>({
    default: '',
    type: String,
})

defineEmits<{
    (event: 'enter'): void
}>()
</script>

<template>
    <div>
        <label class="input w-full">
            <v-icon name="io-person-outline" class="opacity-50" />
            <input v-model="username" type="text" :placeholder="$t('placeholder.username')"
                @keydown.enter="$emit('enter')" required />
        </label>
    </div>
</template>
