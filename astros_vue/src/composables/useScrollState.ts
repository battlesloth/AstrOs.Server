import { ref, computed } from 'vue';

export interface ScrollState {
  thumbWidth: number;
  isDragging: boolean;
  offset: number;
  currentWorldX: number;
}

export interface VerticalScrollState {
  thumbHeight: number;
  isDragging: boolean;
  offset: number;
  currentWorldY: number;
}

export function useScrollState() {
  // Horizontal scroll state
  const scrollState = ref<ScrollState>({
    thumbWidth: 60,
    isDragging: false,
    offset: 0,
    currentWorldX: 0,
  });

  // Vertical scroll state
  const verticalScrollState = ref<VerticalScrollState>({
    thumbHeight: 60,
    isDragging: false,
    offset: 0,
    currentWorldY: 0,
  });

  // Computed refs for backward compatibility - Horizontal
  const scrollThumbWidth = computed({
    get: () => scrollState.value.thumbWidth,
    set: (val) => {
      scrollState.value.thumbWidth = val;
    },
  });

  const isDraggingThumb = computed({
    get: () => scrollState.value.isDragging,
    set: (val) => {
      scrollState.value.isDragging = val;
    },
  });

  const scrollOffset = computed({
    get: () => scrollState.value.offset,
    set: (val) => {
      scrollState.value.offset = val;
    },
  });

  const currentWorldX = computed({
    get: () => scrollState.value.currentWorldX,
    set: (val) => {
      scrollState.value.currentWorldX = val;
    },
  });

  // Computed refs for backward compatibility - Vertical
  const verticalScrollThumbHeight = computed({
    get: () => verticalScrollState.value.thumbHeight,
    set: (val) => {
      verticalScrollState.value.thumbHeight = val;
    },
  });

  const isDraggingVerticalThumb = computed({
    get: () => verticalScrollState.value.isDragging,
    set: (val) => {
      verticalScrollState.value.isDragging = val;
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
    scrollState,
    verticalScrollState,
    // Horizontal
    scrollThumbWidth,
    isDraggingThumb,
    scrollOffset,
    currentWorldX,
    // Vertical
    verticalScrollThumbHeight,
    isDraggingVerticalThumb,
    verticalScrollOffset,
    currentWorldY,
  };
}
