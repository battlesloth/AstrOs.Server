import { ref, computed } from 'vue';
import {
  calculateMaxScroll,
  calculateScrollOffset,
  calculateWorldPosition,
  clampWorldPosition,
} from '@/utils/scrollCalculations';

export interface HorizontalScrollState {
  offset: number;
  currentWorldX: number;
}

export interface VerticalScrollState {
  offset: number;
  currentWorldY: number;
}

export interface ScrollDimensions {
  contentSize: number;
  viewportSize: number;
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

  /**
   * Update horizontal scroll based on world position delta
   * @param deltaX The change in world position
   * @param dimensions The content and viewport dimensions
   * @param startWorldX The world position when drag started
   */
  function updateHorizontalScrollByDelta(
    deltaX: number,
    dimensions: ScrollDimensions,
    startWorldX: number,
  ) {
    const maxScroll = calculateMaxScroll(dimensions.contentSize, dimensions.viewportSize);
    if (maxScroll > 0) {
      const newWorldX = clampWorldPosition(startWorldX + deltaX, maxScroll);
      currentWorldX.value = newWorldX;
      horizontalScrollOffset.value = calculateScrollOffset(newWorldX, maxScroll);
    }
  }

  /**
   * Update vertical scroll based on world position delta
   * @param deltaY The change in world position
   * @param dimensions The content and viewport dimensions
   * @param startWorldY The world position when drag started
   */
  function updateVerticalScrollByDelta(
    deltaY: number,
    dimensions: ScrollDimensions,
    startWorldY: number,
  ) {
    const maxScroll = calculateMaxScroll(dimensions.contentSize, dimensions.viewportSize);
    if (maxScroll > 0) {
      const newWorldY = clampWorldPosition(startWorldY + deltaY, maxScroll);
      currentWorldY.value = newWorldY;
      verticalScrollOffset.value = calculateScrollOffset(newWorldY, maxScroll);
    }
  }

  /**
   * Update horizontal scroll offset and calculate world position
   * @param offset The new scroll offset (0-1)
   * @param dimensions The content and viewport dimensions
   */
  function updateHorizontalScroll(offset: number, dimensions: ScrollDimensions) {
    horizontalScrollOffset.value = offset;
    const maxScroll = calculateMaxScroll(dimensions.contentSize, dimensions.viewportSize);
    currentWorldX.value = calculateWorldPosition(offset, maxScroll);
    return currentWorldX.value;
  }

  /**
   * Update vertical scroll offset and calculate world position
   * @param offset The new scroll offset (0-1)
   * @param dimensions The content and viewport dimensions
   */
  function updateVerticalScroll(offset: number, dimensions: ScrollDimensions) {
    verticalScrollOffset.value = offset;
    const maxScroll = calculateMaxScroll(dimensions.contentSize, dimensions.viewportSize);
    currentWorldY.value = calculateWorldPosition(offset, maxScroll);
    return currentWorldY.value;
  }

  /**
   * Clamp and update horizontal scroll position on viewport resize
   * @param dimensions The new content and viewport dimensions
   */
  function clampHorizontalScroll(dimensions: ScrollDimensions) {
    const maxScroll = calculateMaxScroll(dimensions.contentSize, dimensions.viewportSize);
    if (maxScroll <= 0) {
      horizontalScrollOffset.value = 0;
      currentWorldX.value = 0;
    } else {
      const clampedWorldX = clampWorldPosition(currentWorldX.value, maxScroll);
      currentWorldX.value = clampedWorldX;
      horizontalScrollOffset.value = calculateScrollOffset(clampedWorldX, maxScroll);
    }
    return currentWorldX.value;
  }

  /**
   * Clamp and update vertical scroll position on viewport resize
   * @param dimensions The new content and viewport dimensions
   */
  function clampVerticalScroll(dimensions: ScrollDimensions) {
    const maxScroll = calculateMaxScroll(dimensions.contentSize, dimensions.viewportSize);
    if (maxScroll <= 0) {
      verticalScrollOffset.value = 0;
      currentWorldY.value = 0;
    } else {
      const clampedWorldY = clampWorldPosition(currentWorldY.value, maxScroll);
      currentWorldY.value = clampedWorldY;
      verticalScrollOffset.value = calculateScrollOffset(clampedWorldY, maxScroll);
    }
    return currentWorldY.value;
  }

  /**
   * Update vertical scroll by wheel delta
   * @param deltaY The wheel delta
   * @param dimensions The content and viewport dimensions
   * @param scrollSpeed The scroll speed multiplier
   */
  function updateVerticalScrollByWheel(
    deltaY: number,
    dimensions: ScrollDimensions,
    scrollSpeed: number = 0.5,
  ) {
    const maxScroll = calculateMaxScroll(dimensions.contentSize, dimensions.viewportSize);
    if (maxScroll <= 0) return false;

    const scrollDelta = deltaY * scrollSpeed;
    const newWorldY = clampWorldPosition(currentWorldY.value + scrollDelta, maxScroll);
    currentWorldY.value = newWorldY;
    verticalScrollOffset.value = calculateScrollOffset(newWorldY, maxScroll);
    return true;
  }

  return {
    horizontalScrollState,
    verticalScrollState,
    // Horizontal
    horizontalScrollOffset,
    currentWorldX,
    // Vertical
    verticalScrollOffset,
    currentWorldY,
    // Methods
    updateHorizontalScrollByDelta,
    updateVerticalScrollByDelta,
    updateHorizontalScroll,
    updateVerticalScroll,
    clampHorizontalScroll,
    clampVerticalScroll,
    updateVerticalScrollByWheel,
  };
}
