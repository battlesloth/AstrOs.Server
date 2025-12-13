<script setup lang="ts">
import { computed } from 'vue';

// Props
const props = defineProps({
    testId: {
        type: String,
        required: true
    },
    enabled: {
        type: Boolean,
        default: false
    },
    name: {
        type: String,
        default: ''
    },
    invert: {
        type: Boolean,
        default: false
    },
    isServo: {
        type: Boolean,
        default: false
    },
    minPulse: {
        type: Number,
        default: 500
    },
    maxPulse: {
        type: Number,
        default: 2500
    },
    homePosition: {
        type: Number,
        default: 1500
    }
});

// Emits
const emit = defineEmits<{
    'update:name': [value: string];
    'update:invert': [value: boolean];
    'update:minPulse': [value: number];
    'update:maxPulse': [value: number];
    'update:homePosition': [value: number];
}>();

// Computed
const typeLabel = computed(() => props.isServo ? 'Inverted' : 'Default High');

// Local models with emit
const nameModel = computed({
    get: () => props.name,
    set: (value) => emit('update:name', value)
});

const invertModel = computed({
    get: () => props.invert,
    set: (value) => emit('update:invert', value)
});

const minPulseModel = computed({
    get: () => props.minPulse,
    set: (value) => emit('update:minPulse', value)
});

const maxPulseModel = computed({
    get: () => props.maxPulse,
    set: (value) => emit('update:maxPulse', value)
});

const homePositionModel = computed({
    get: () => props.homePosition,
    set: (value) => emit('update:homePosition', value)
});
</script>

<template>
    <div v-if="enabled" class="flex flex-wrap gap-4">
        <!-- First Row: Name and Type -->
        <div class="flex items-center gap-4 min-w-87.5 grow">
            <div class="grow">
                <input :data-testid="`${testId}-name`" v-model="nameModel" placeholder="Name"
                    class="input input-bordered input-sm w-full" />
            </div>
            <div class="form-control">
                <label class="label cursor-pointer gap-2">
                    <span class="label-text">{{ typeLabel }}</span>
                    <input type="checkbox" :data-testid="`${testId}-invert-cbx`" v-model="invertModel"
                        class="checkbox checkbox-sm" />
                </label>
            </div>
        </div>

        <!-- Second Row: Servo Settings (only if isServo) -->
        <div v-if="isServo" class="flex items-center gap-4 min-w-87.5 grow">
            <div class="flex items-center gap-2">
                <span class="text-sm">Min μS</span>
                <input :data-testid="`${testId}-minPulse`" v-model.number="minPulseModel" type="number"
                    placeholder="500" class="input input-bordered input-sm w-16 text-center" />
            </div>
            <div class="grow"></div>
            <div class="flex items-center gap-2">
                <span class="text-sm">Max μS</span>
                <input :data-testid="`${testId}-maxPulse`" v-model.number="maxPulseModel" type="number"
                    placeholder="2500" class="input input-bordered input-sm w-16 text-center" />
            </div>
            <div class="grow"></div>
            <div class="flex items-center gap-2">
                <span class="text-sm">Home μS</span>
                <input :data-testid="`${testId}-homePosition`" v-model.number="homePositionModel" type="number"
                    placeholder="1500" class="input input-bordered input-sm w-16 text-center" />
            </div>
        </div>
    </div>
</template>
