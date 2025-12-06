import { ref, computed } from 'vue';

export interface DragState {
    isDragging: boolean;
    startX: number;
    startY: number;
    startWorldX: number;
    startWorldY: number;
    hasDragged: boolean;
}

export function useDragState() {
    const dragState = ref<DragState>({
        isDragging: false,
        startX: 0,
        startY: 0,
        startWorldX: 0,
        startWorldY: 0,
        hasDragged: false
    });

    // Computed refs for backward compatibility
    const isDraggingTimeline = computed({
        get: () => dragState.value.isDragging,
        set: (val) => { dragState.value.isDragging = val; }
    });

    const dragStartX = computed({
        get: () => dragState.value.startX,
        set: (val) => { dragState.value.startX = val; }
    });

    const dragStartY = computed({
        get: () => dragState.value.startY,
        set: (val) => { dragState.value.startY = val; }
    });

    const dragStartWorldX = computed({
        get: () => dragState.value.startWorldX,
        set: (val) => { dragState.value.startWorldX = val; }
    });

    const dragStartWorldY = computed({
        get: () => dragState.value.startWorldY,
        set: (val) => { dragState.value.startWorldY = val; }
    });

    const hasDragged = computed({
        get: () => dragState.value.hasDragged,
        set: (val) => { dragState.value.hasDragged = val; }
    });

    return {
        dragState,
        isDraggingTimeline,
        dragStartX,
        dragStartY,
        dragStartWorldX,
        dragStartWorldY,
        hasDragged
    };
}
