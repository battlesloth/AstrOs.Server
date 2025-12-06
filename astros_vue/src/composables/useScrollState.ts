import { ref, computed } from 'vue';

export interface HorizontalScrollState {
    offset: number;
    currentWorldX: number;
}

export interface VerticalScrollState {
    offset: number;
    currentWorldY: number;
}

export function useScrollState() {
    // Horizontal scroll state
    const horizontalScrollState = ref<HorizontalScrollState>({
        offset: 0,
        currentWorldX: 0,
    });

    // Vertical scroll state
    const verticalScrollState = ref<VerticalScrollState>({
        offset: 0,
        currentWorldY: 0,
    });

    const horizontalScrollOffset = computed({
        get: () => horizontalScrollState.value.offset,
        set: (val) => {
            horizontalScrollState.value.offset = val;
        },
    });

    const currentWorldX = computed({
        get: () => horizontalScrollState.value.currentWorldX,
        set: (val) => {
            horizontalScrollState.value.currentWorldX = val;
        },
    });

    const verticalScrollOffset = computed({
        get: () => verticalScrollState.value.offset,
        set: (val) => {
            verticalScrollState.value.offset = val;
        },
    });

    const currentWorldY = computed({
        get: () => verticalScrollState.value.currentWorldY,
        set: (val) => {
            verticalScrollState.value.currentWorldY = val;
        },
    });

    return {
        horizontalScrollState,
        verticalScrollState,
        // Horizontal
        horizontalScrollOffset,
        currentWorldX,
        // Vertical
        verticalScrollOffset,
        currentWorldY,
    };
}
