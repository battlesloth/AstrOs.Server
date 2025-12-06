// ============================================================================
// LAYOUT CONSTANTS
// ============================================================================

// Element dimensions
export const rowHeight = 60;
export const timelineHeight = 50;
export const scrollBarHeight = 15;
export const addChannelButtonHeight = scrollBarHeight + timelineHeight; // Combined height of scrollbar and timeline
export const channelListWidth = 256; // 64 * 4 = 256px

// Scrollbar dimensions
export const verticalScrollBarWidth = 15;
export const minVerticalScrollThumbHeight = 40;
export const minScrollThumbWidth = 40; // Minimum horizontal thumb width

// ============================================================================
// TIMELINE CONSTANTS
// ============================================================================

export const PIXELS_PER_SECOND = 30;
export const TIMELINE_DURATION_SECONDS = 600; // 10 minutes
export const PIXELS_PER_MAJOR_TICK = 10 * PIXELS_PER_SECOND; // 300 pixels - consistent spacing across all zoom levels

// ============================================================================
// INTERACTION THRESHOLDS
// ============================================================================

export const DRAG_THRESHOLD_PIXELS = 3; // Minimum movement to register as drag
export const ZOOM_SCROLL_TICKS_REQUIRED = 2; // Number of scroll events needed to trigger zoom

// Zoom snap thresholds
export const ZOOM_SNAP_THRESHOLD_START = 0.05; // Snap to beginning if within 5% of start
export const ZOOM_SNAP_THRESHOLD_END = 0.95; // Snap to end if within 95% of end

// Zoom focus point weights
export const ZOOM_FOCUS_EDGE_WEIGHT = 0.8; // Focus point position when at edges (80% of viewport)
export const ZOOM_FOCUS_START_WEIGHT = 0.2; // Focus point position when at start (20% of viewport)
export const ZOOM_FOCUS_EDGE_BIAS_MULTIPLIER = 0.3; // How much scroll position affects focus point
