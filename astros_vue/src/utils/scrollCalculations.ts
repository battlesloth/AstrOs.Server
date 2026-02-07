/**
 * Calculate the maximum scroll distance for a given content and viewport size
 */
export function calculateMaxScroll(contentSize: number, viewportSize: number): number {
  return Math.max(0, contentSize - viewportSize);
}

/**
 * Calculate the scroll offset (0-1) from a world position
 */
export function calculateScrollOffset(worldPosition: number, maxScroll: number): number {
  if (maxScroll <= 0) return 0;
  return worldPosition / maxScroll;
}

/**
 * Calculate the world position from a scroll offset (0-1)
 */
export function calculateWorldPosition(scrollOffset: number, maxScroll: number): number {
  if (maxScroll <= 0) return 0;
  return scrollOffset * maxScroll;
}

/**
 * Clamp a world position to valid scroll bounds
 */
export function clampWorldPosition(worldPosition: number, maxScroll: number): number {
  return Math.max(0, Math.min(worldPosition, maxScroll));
}

/**
 * Calculate viewport ratio for scrollbar thumb sizing
 */
export function calculateViewportRatio(viewportSize: number, contentSize: number): number {
  return viewportSize / contentSize;
}

/**
 * Calculate scrollbar thumb size with minimum constraint
 */
export function calculateThumbSize(
  scrollbarSize: number,
  viewportRatio: number,
  minThumbSize: number,
): number {
  return Math.max(minThumbSize, scrollbarSize * viewportRatio);
}
