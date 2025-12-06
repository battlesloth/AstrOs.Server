<script setup lang="ts">
import AstrosLayout from '@/components/layout/AstrosLayout.vue';
import { Application, Container, Graphics, HTMLText } from 'pixi.js';
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';

// Import composables
import { useZoomState, ZOOM_LEVELS } from '@/composables/useZoomState';
import { useScrollState } from '@/composables/useScrollState';
import { useDragState } from '@/composables/useDragState';
import { usePerformanceFlags } from '@/composables/usePerformanceFlags';
import { useEventBoxes } from '@/composables/useEventBoxes';
import * as constants from '@/composables/timelineConstants';
import type { Channel } from '@/composables/types';

// Import utilities
import { createCircularButton, drawPlusIcon, drawMinusIcon } from '@/pixiComponents/pixiButtons';
import {
  drawTimelineBackground,
  drawTimelineTicks,
  drawTimelineLabels,
} from '@/pixiComponents/timelineRendering';
import { PixiScrollBar } from '@/pixiComponents/pixiScrollBar';
import { ScrollBarDirection } from '@/pixiComponents/pixiScrollBarOptions';

// ============================================================================
// APPLICATION REFS
// ============================================================================

const app = ref<Application | null>(null);
const pixiContainer = ref<HTMLDivElement | null>(null);
const channels = ref<Channel[]>([]);
const lastChannelClicked = ref<string>('None');

// ============================================================================
// CONSTANTS (imported from composables)
// ============================================================================

const {
  ROW_HEIGHT: ROW_HEIGHT,
  TIMELINE_HEIGHT,
  SCROLL_BAR_HEIGHT,
  ADD_CHANNEL_BUTTON_HEIGHT,
  CHANNEL_LIST_WIDTH,
  VERTICAL_SCROLL_BAR_WIDTH,
  MIN_VERTICAL_SCROLL_THUMB_HEIGHT,
  MIN_SCROLL_THUMB_WIDTH,
  PIXELS_PER_SECOND,
  TIMELINE_DURATION_SECONDS,
  PIXELS_PER_MAJOR_TICK,
  DRAG_THRESHOLD_PIXELS,
  ZOOM_SCROLL_TICKS_REQUIRED,
  ZOOM_SNAP_THRESHOLD_START,
  ZOOM_SNAP_THRESHOLD_END,
  ZOOM_FOCUS_EDGE_WEIGHT,
  ZOOM_FOCUS_START_WEIGHT,
  ZOOM_FOCUS_EDGE_BIAS_MULTIPLIER,
} = constants;

// ============================================================================
// PIXI CONTAINERS & GRAPHICS REFS
// ============================================================================

const mainContainer = ref<Container | null>(null);
const scrollableContentContainer = ref<Container | null>(null);
const uiLayer = ref<Container | null>(null);
const channelListContainer = ref<Container | null>(null);
const channelListScrollableContainer = ref<Container | null>(null);
const timeline = ref<Container | null>(null);
const channelRowContainers = ref<Map<number, Container>>(new Map());

// Scrollbar graphics
const horizontalScrollBar = ref<PixiScrollBar | null>(null);
const verticalScrollBar = ref<PixiScrollBar | null>(null);

// UI buttons
const plusButton = ref<Container | null>(null);
const minusButton = ref<Container | null>(null);

// ============================================================================
// STATE (using composables)
// ============================================================================

const {
  zoomLevel,
  zoomScrollAccumulator,
  TIMELINE_WIDTH,
  canZoomIn,
  canZoomOut,
  currentZoomConfig,
} = useZoomState(PIXELS_PER_SECOND, TIMELINE_DURATION_SECONDS);

const {
  horizontalScrollOffset,
  currentWorldX,
  verticalScrollOffset,
  currentWorldY,
} = useScrollState();

const { isDraggingTimeline, dragStartX, dragStartY, dragStartWorldX, dragStartWorldY, hasDragged } =
  useDragState();

const { eventBoxPositionsDirty, rowBackgroundsDirty, lastTimelineWidth } = usePerformanceFlags(
  (PIXELS_PER_SECOND * TIMELINE_DURATION_SECONDS) / ZOOM_LEVELS[0]!.scaleMultiplier,
);

// Event boxes composable
const {
  channelEventBoxes,
  isDraggingEventBox,
  hasEventBoxDragged,
  addEventBox,
  updateEventBoxPositions,
  updateAllEventBoxPositions,
  handleEventBoxDrag,
  endEventBoxDrag,
} = useEventBoxes(TIMELINE_WIDTH, TIMELINE_DURATION_SECONDS, ROW_HEIGHT);

// Other
let resizeObserver: ResizeObserver | null = null;

// ============================================================================
// WATCHERS
// ============================================================================

// Watch for timeline width changes to mark event positions dirty
watch(TIMELINE_WIDTH, (newWidth, oldWidth) => {
  if (newWidth !== oldWidth) {
    eventBoxPositionsDirty.value = true;
    rowBackgroundsDirty.value = true;
    lastTimelineWidth.value = newWidth;
  }
});

// Watch scroll offset and update main container position
watch(horizontalScrollOffset, (newOffset) => {
  if (scrollableContentContainer.value && timeline.value && app.value) {
    const canvasWidth = app.value.screen.width;
    const scrollbarWidth = canvasWidth - CHANNEL_LIST_WIDTH;
    const maxScroll = Math.max(0, TIMELINE_WIDTH.value - scrollbarWidth);
    const worldX = maxScroll > 0 ? newOffset * maxScroll : 0;
    // Apply horizontal scroll to scrollable content and timeline
    scrollableContentContainer.value.x = CHANNEL_LIST_WIDTH - worldX;
    timeline.value.x = CHANNEL_LIST_WIDTH - worldX;
    currentWorldX.value = worldX; // Store current world position
  }
});

// Watch vertical scroll offset and update container Y position
watch(verticalScrollOffset, (newOffset) => {
  if (scrollableContentContainer.value && app.value && channelListScrollableContainer.value) {
    const canvasHeight = app.value.screen.height;
    const availableHeight = canvasHeight - ADD_CHANNEL_BUTTON_HEIGHT;
    const totalContentHeight = channels.value.length * ROW_HEIGHT;
    const maxScrollY = Math.max(0, totalContentHeight - availableHeight);
    const worldY = maxScrollY > 0 ? newOffset * maxScrollY : 0;

    // Apply vertical scroll only to scrollable content
    scrollableContentContainer.value.y = ADD_CHANNEL_BUTTON_HEIGHT - worldY;
    currentWorldY.value = worldY;

    // Also scroll the channel list scrollable container
    channelListScrollableContainer.value.y = ADD_CHANNEL_BUTTON_HEIGHT - worldY;
  }
});

/*const containerHeight = computed(() => {
  const spriteCount = channels.value.length;
  return TIMELINE_HEIGHT + spriteCount * ROW_HEIGHT;
});
*/

onMounted(async () => {
  if (!pixiContainer.value) return;

  app.value = new Application();

  await app.value.init({
    width: pixiContainer.value.clientWidth || 800,
    height: pixiContainer.value.clientHeight || 600,
    backgroundColor: 0x000000,
    antialias: true,
    resolution: window.devicePixelRatio || 1,
  });

  pixiContainer.value.appendChild(app.value.canvas);

  // Make canvas responsive
  if (app.value.canvas) {
    app.value.canvas.style.width = '100%';
    app.value.canvas.style.height = '100%';
    app.value.canvas.style.display = 'block';
  }

  // Create main container for content
  mainContainer.value = new Container();
  app.value.stage.addChild(mainContainer.value as any);

  // Create scrollable content container inside main container
  scrollableContentContainer.value = new Container();
  scrollableContentContainer.value.x = CHANNEL_LIST_WIDTH;
  scrollableContentContainer.value.y = ADD_CHANNEL_BUTTON_HEIGHT;
  scrollableContentContainer.value.eventMode = 'static';

  // Add pointer down handler for drag scrolling (middle mouse button only)
  scrollableContentContainer.value.on('pointerdown', (event) => {
    // Only enable drag scrolling with middle mouse button (button 1)
    if (event.button !== 1) return;

    isDraggingTimeline.value = true;
    hasDragged.value = false;
    const globalPos = event.global;
    dragStartX.value = globalPos.x;
    dragStartY.value = globalPos.y;
    dragStartWorldX.value = currentWorldX.value;
    dragStartWorldY.value = currentWorldY.value;
  });

  mainContainer.value.addChild(scrollableContentContainer.value as any);

  // Create UI layer (always on top)
  uiLayer.value = new Container();
  app.value.stage.addChild(uiLayer.value as any);

  createHorizontalScrollbar();
  createVerticalScrollbar();
  createTimeline();
  createZoomButtons();

  channelListContainer.value = new Container();
  uiLayer.value.addChild(channelListContainer.value as any);

  channelListScrollableContainer.value = new Container();
  channelListScrollableContainer.value.y = ADD_CHANNEL_BUTTON_HEIGHT;
  channelListContainer.value.addChild(channelListScrollableContainer.value as any);

  createChannelList();

  resizeObserver = new ResizeObserver((entries) => {
    // Use requestAnimationFrame to ensure layout is complete
    requestAnimationFrame(() => {
      if (entries && entries.length > 0) {
        const entry = entries[0];
        const width = entry?.contentRect.width;
        const height = entry?.contentRect.height;

        if (width && height && width > 0 && height > 0) {
          handleResize();
        }
      }
    });
  });

  if (pixiContainer.value) {
    resizeObserver.observe(pixiContainer.value);
  }

  addAppStageListeners();

  // Global mouse move and up events for continuous dragging
  window.addEventListener('mousemove', handleGlobalMouseMove);
  window.addEventListener('mouseup', handleGlobalMouseUp);

  // Add wheel event listener for scrolling
  if (pixiContainer.value) {
    pixiContainer.value.addEventListener('wheel', handleWheel, { passive: false });
  }
});

onUnmounted(() => {
  if (resizeObserver) {
    resizeObserver.disconnect();
    resizeObserver = null;
  }
  window.removeEventListener('mousemove', handleGlobalMouseMove);
  window.removeEventListener('mouseup', handleGlobalMouseUp);

  if (pixiContainer.value) {
    pixiContainer.value.removeEventListener('wheel', handleWheel);
  }

  app.value?.destroy(true, {
    children: true,
    texture: true,
    textureSource: true,
    context: true,
  });
  app.value = null;
  channels.value = [];
  mainContainer.value = null;
  scrollableContentContainer.value = null;
  uiLayer.value = null;
  channelListContainer.value = null;
  channelListScrollableContainer.value = null;
  horizontalScrollBar.value = null;
  timeline.value = null;
  verticalScrollBar.value = null;
  channelRowContainers.value.clear();
});

function createHorizontalScrollbar() {
  if (!app.value || !uiLayer.value) return;

  const barWidth = app.value.screen.width - CHANNEL_LIST_WIDTH;
  const viewportRatio = barWidth / TIMELINE_WIDTH.value;
  const thumbSize = Math.max(MIN_SCROLL_THUMB_WIDTH, barWidth * viewportRatio);

  const options = {
    barWidth,
    barHeight: SCROLL_BAR_HEIGHT,
    xOffset: CHANNEL_LIST_WIDTH,
    yOffset: 0,
    direction: ScrollBarDirection.HORIZONTAL,
    fillColor: 0x333333,
    thumbSize,
    thumbFillColor: 0x888888,
    thumbFocusColor: 0xcccccc,
    onThumbDragStart: () => {
      if (app.value) {
        app.value.stage.eventMode = 'static';
      }
    }
  }

  horizontalScrollBar.value = new PixiScrollBar(options);
  uiLayer.value.addChild(horizontalScrollBar.value as any);
}

function createVerticalScrollbar() {
  if (!app.value || !uiLayer.value) return;

  const options = {
    barWidth: VERTICAL_SCROLL_BAR_WIDTH,
    barHeight: app.value.screen.height - ADD_CHANNEL_BUTTON_HEIGHT,
    xOffset: app.value.screen.width - VERTICAL_SCROLL_BAR_WIDTH,
    yOffset: ADD_CHANNEL_BUTTON_HEIGHT,
    direction: ScrollBarDirection.VERTICAL,
    fillColor: 0x333333,
    thumbSize: 0,
    thumbFillColor: 0x888888,
    thumbFocusColor: 0xaaaaaa,
    onThumbDragStart: () => {
      if (app.value) {
        app.value.stage.eventMode = 'static';
      }
    }
  }

  verticalScrollBar.value = new PixiScrollBar(options);

  uiLayer.value.addChild(verticalScrollBar.value as any);
}

function addAppStageListeners() {
  if (app?.value?.stage) {
    app.value.stage.on('pointerup', () => {
      horizontalScrollBar.value?.endDrag();
      verticalScrollBar.value?.endDrag();
      // Handle event box drag end
      endEventBoxDrag();
    });

    app.value.stage.on('pointermove', (event) => {

      if (horizontalScrollBar?.value?.isDragging()) {
        horizontalScrollOffset.value = horizontalScrollBar.value.drag(event.global.x);
      }

      if (verticalScrollBar?.value?.isDragging()) {
        verticalScrollOffset.value = verticalScrollBar.value.drag(event.global.y);
      }

      // Handle event box dragging
      handleEventBoxDrag(event.global.x);
    });

    // Global pointer up to catch mouse release anywhere
    app.value.stage.on('pointerupoutside', () => {
      horizontalScrollBar.value?.endDrag();
      verticalScrollBar.value?.endDrag();
      // Handle event box drag end outside
      endEventBoxDrag();
    });
  }
}

function createTimeline() {
  if (!app.value || !uiLayer.value) return;

  timeline.value = new Container();
  timeline.value.x = CHANNEL_LIST_WIDTH; // Start after channel list
  timeline.value.y = SCROLL_BAR_HEIGHT; // Position below the scrollbar

  const graphics = new Graphics();

  // Get zoom configuration
  const zoomConfig = ZOOM_LEVELS[zoomLevel.value]!;
  const majorTickInterval = zoomConfig.majorTickInterval;
  const minorTickInterval = zoomConfig.minorTickInterval;

  // Draw timeline components using utility functions
  drawTimelineBackground(graphics, TIMELINE_WIDTH.value, TIMELINE_HEIGHT);
  drawTimelineTicks(
    graphics,
    majorTickInterval,
    minorTickInterval,
    TIMELINE_HEIGHT,
    TIMELINE_WIDTH.value,
    TIMELINE_DURATION_SECONDS,
    PIXELS_PER_MAJOR_TICK,
  );

  timeline.value.addChild(graphics);

  // Add time labels (after graphics so they're on top)
  drawTimelineLabels(
    timeline.value as Container,
    majorTickInterval,
    TIMELINE_DURATION_SECONDS,
    PIXELS_PER_MAJOR_TICK,
    TIMELINE_HEIGHT,
  );

  uiLayer.value.addChild(timeline.value as any);
}

function createZoomButtons() {
  if (!app.value || !uiLayer.value) return;

  const canvasWidth = app.value.screen.width;
  const buttonRadius = 15;
  const buttonSpacing = 8;
  const rightMargin = VERTICAL_SCROLL_BAR_WIDTH + 10;
  const topMargin = SCROLL_BAR_HEIGHT + 10;

  // Create buttons (minus on left, plus on right)
  minusButton.value = createCircularButton(
    canvasWidth - rightMargin - buttonRadius * 4 - buttonSpacing,
    topMargin,
    buttonRadius,
    drawMinusIcon,
    () => zoom('out'),
  );

  plusButton.value = createCircularButton(
    canvasWidth - rightMargin - buttonRadius * 2,
    topMargin,
    buttonRadius,
    drawPlusIcon,
    () => zoom('in'),
  );

  uiLayer.value.addChild(plusButton.value as any);
  uiLayer.value.addChild(minusButton.value as any);
}

function zoom(direction: 'in' | 'out') {
  // Check bounds
  if (direction === 'out' && zoomLevel.value >= ZOOM_LEVELS.length - 1) return;
  if (direction === 'in' && zoomLevel.value <= 0) return;

  // Update zoom level
  zoomLevel.value = direction === 'out' ? zoomLevel.value + 1 : zoomLevel.value - 1;

  // Get scale multiplier from configuration
  const scaleMultiplier = ZOOM_LEVELS[zoomLevel.value]!.scaleMultiplier;

  // Update timeline width based on scale
  const oldTimelineWidth = TIMELINE_WIDTH.value;
  TIMELINE_WIDTH.value = (PIXELS_PER_SECOND * TIMELINE_DURATION_SECONDS) / scaleMultiplier;

  // Mark event positions as dirty since timeline width changed
  if (oldTimelineWidth !== TIMELINE_WIDTH.value) {
    eventBoxPositionsDirty.value = true;
    rowBackgroundsDirty.value = true;
    lastTimelineWidth.value = TIMELINE_WIDTH.value;
  }

  // Calculate the focus point before zoom based on scroll position
  if (app.value) {
    const canvasWidth = app.value.screen.width;
    const scrollbarWidth = canvasWidth - CHANNEL_LIST_WIDTH;

    // Calculate the old max scroll to determine position in timeline
    const oldMaxScroll = Math.max(0, oldTimelineWidth - scrollbarWidth);

    // Determine the focus point based on current scroll position
    let focusPointX: number;

    if (oldMaxScroll === 0) {
      // Timeline fits entirely in viewport, use center
      focusPointX = scrollbarWidth / 2;
    } else {
      // Calculate how far through the timeline we are (0 = start, 1 = end)
      const scrollProgress = currentWorldX.value / oldMaxScroll;

      // If at the end (>95%), keep the end visible
      if (scrollProgress > ZOOM_SNAP_THRESHOLD_END) {
        // Focus on a point near the right edge of viewport
        focusPointX = scrollbarWidth * ZOOM_FOCUS_EDGE_WEIGHT;
      }
      // If at the beginning (<5%), keep the beginning visible
      else if (scrollProgress < ZOOM_SNAP_THRESHOLD_START) {
        // Focus on a point near the left edge of viewport
        focusPointX = scrollbarWidth * ZOOM_FOCUS_START_WEIGHT;
      }
      // Otherwise, use a weighted focus point
      else {
        // Blend between center and edges based on scroll progress
        // scrollProgress 0.5 (middle) -> use center
        // scrollProgress > 0.5 (toward end) -> bias right
        // scrollProgress < 0.5 (toward start) -> bias left
        const centerWeight = 1 - Math.abs(scrollProgress - 0.5) * 2; // 1 at middle, 0 at edges
        const edgeBias =
          scrollProgress > 0.5
            ? (scrollProgress - 0.5) * 2 // 0 to 1 as we move toward end
            : -(0.5 - scrollProgress) * 2; // -1 to 0 as we move toward start

        focusPointX =
          scrollbarWidth * (0.5 + edgeBias * ZOOM_FOCUS_EDGE_BIAS_MULTIPLIER * (1 - centerWeight));
      }
    }

    // Calculate the time at the focus point
    const focusTimeInSeconds =
      ((currentWorldX.value + focusPointX) / oldTimelineWidth) * TIMELINE_DURATION_SECONDS;

    // Calculate where that time should be in the new timeline
    const newFocusPositionX =
      (focusTimeInSeconds / TIMELINE_DURATION_SECONDS) * TIMELINE_WIDTH.value;

    // Calculate new scroll position to keep the focus time at the focus point
    const newWorldX = newFocusPositionX - focusPointX;
    const newMaxScroll = Math.max(0, TIMELINE_WIDTH.value - scrollbarWidth);

    if (newMaxScroll > 0) {
      // If we were at the beginning before (<5%), snap to the beginning after zoom
      if (oldMaxScroll > 0 && currentWorldX.value / oldMaxScroll < ZOOM_SNAP_THRESHOLD_START) {
        currentWorldX.value = 0;
        horizontalScrollOffset.value = 0;
      }
      // If we were at the end before (>95%), snap to the end after zoom
      else if (oldMaxScroll > 0 && currentWorldX.value / oldMaxScroll > ZOOM_SNAP_THRESHOLD_END) {
        currentWorldX.value = newMaxScroll;
        horizontalScrollOffset.value = 1;
      } else {
        currentWorldX.value = Math.max(0, Math.min(newWorldX, newMaxScroll));
        horizontalScrollOffset.value = currentWorldX.value / newMaxScroll;
      }
    } else {
      currentWorldX.value = 0;
      horizontalScrollOffset.value = 0;
    }
  }

  // Recreate timeline with new scale
  if (timeline.value && uiLayer.value) {
    uiLayer.value.removeChild(timeline.value as any);
    timeline.value = null;
  }
  createTimeline();

  // Re-add buttons and channel list so they stay on top of timeline
  if (plusButton.value && minusButton.value && uiLayer.value) {
    uiLayer.value.removeChild(plusButton.value as any);
    uiLayer.value.removeChild(minusButton.value as any);
    uiLayer.value.addChild(plusButton.value as any);
    uiLayer.value.addChild(minusButton.value as any);
  }

  // Re-add channel list container so it stays on top
  if (channelListContainer.value && uiLayer.value) {
    uiLayer.value.removeChild(channelListContainer.value as any);
    uiLayer.value.addChild(channelListContainer.value as any);
  }

  // Update scrollbar to match new timeline width
  updateHorizontalScrollbar();

  // Update the timeline and scrollable content positions based on new scroll values
  if (scrollableContentContainer.value && timeline.value && app.value) {
    const canvasWidth = app.value.screen.width;
    const scrollbarWidth = canvasWidth - CHANNEL_LIST_WIDTH;
    const maxScroll = Math.max(0, TIMELINE_WIDTH.value - scrollbarWidth);
    const worldX = maxScroll > 0 ? horizontalScrollOffset.value * maxScroll : 0;
    scrollableContentContainer.value.x = CHANNEL_LIST_WIDTH - worldX;
    timeline.value.x = CHANNEL_LIST_WIDTH - worldX;
    currentWorldX.value = worldX;
  }

  // Update all event box positions based on new timeline width
  updateAllEventBoxPositions();

  // Update all row backgrounds based on new timeline width
  updateAllRowBackgrounds();
}

function createChannelList() {
  if (!app.value || !channelListContainer.value || !channelListScrollableContainer.value) return;

  // Clear existing content
  channelListContainer.value.removeChildren();

  const canvasHeight = app.value.screen.height;

  // Create background for channel list area (add first so it's behind everything)
  const background = new Graphics().rect(0, 0, CHANNEL_LIST_WIDTH, canvasHeight).fill(0x2a2a2a);
  channelListContainer.value.addChild(background);

  // Re-add the scrollable container (after background)
  channelListScrollableContainer.value = new Container();
  channelListScrollableContainer.value.y = ADD_CHANNEL_BUTTON_HEIGHT;
  channelListContainer.value.addChild(channelListScrollableContainer.value as any);

  // Create "Add Channel" button at the top (fixed position)
  const buttonHeight = ADD_CHANNEL_BUTTON_HEIGHT;
  const buttonContainer = new Container();
  buttonContainer.eventMode = 'static';
  buttonContainer.cursor = 'pointer';

  const button = new Graphics().rect(0, 0, CHANNEL_LIST_WIDTH, buttonHeight).fill(0x4a90e2);

  buttonContainer.addChild(button);

  // Add hover effect
  buttonContainer.on('pointerover', () => {
    button.clear().rect(0, 0, CHANNEL_LIST_WIDTH, buttonHeight).fill(0x5aa0f2);
  });

  buttonContainer.on('pointerout', () => {
    button.clear().rect(0, 0, CHANNEL_LIST_WIDTH, buttonHeight).fill(0x4a90e2);
  });

  buttonContainer.on('pointertap', () => {
    addChannel();
  });

  const buttonText = new HTMLText({
    text: 'Add Channel',
    style: {
      fontFamily: 'Arial, sans-serif',
      fontSize: '16px',
      fill: '#ffffff',
      fontWeight: 'bold',
    },
  });

  // Center the text
  requestAnimationFrame(() => {
    if (buttonText.width > 0 && buttonText.height > 0) {
      buttonText.x = (CHANNEL_LIST_WIDTH - buttonText.width) / 2;
      buttonText.y = (buttonHeight - buttonText.height) / 2;
    }
  });

  buttonText.x = CHANNEL_LIST_WIDTH / 2 - 40;
  buttonText.y = buttonHeight / 2 - 8;

  buttonContainer.addChild(buttonText);
  buttonContainer.zIndex = 10; // Ensure it's on top
  channelListContainer.value.addChild(buttonContainer);

  // Draw channel rows in scrollable container
  channels.value.forEach((channel, index) => {
    const yPos = index * ROW_HEIGHT;

    // Create container for the row
    const rowContainer = new Container();
    rowContainer.y = yPos;

    // Alternating background colors
    const rowColor = index % 2 === 0 ? 0xe5e5e5 : 0xf5f5f5;
    const row = new Graphics().rect(0, 0, CHANNEL_LIST_WIDTH, ROW_HEIGHT).fill(rowColor);

    // Add border
    row.rect(0, ROW_HEIGHT - 1, CHANNEL_LIST_WIDTH, 1).fill(0xcccccc);

    rowContainer.addChild(row);

    const rowText = new HTMLText({
      text: `Row ${index + 1}`,
      style: {
        fontFamily: 'Arial, sans-serif',
        fontSize: '14px',
        fill: '#000000',
      },
    });

    rowText.x = 16;
    rowText.y = ROW_HEIGHT / 2 - 7;

    rowContainer.addChild(rowText);
    channelListScrollableContainer.value!.addChild(rowContainer);
  });
}

function handleGlobalMouseMove(event: MouseEvent) {
  if (!app.value || !pixiContainer.value) return;

  const rect = pixiContainer.value.getBoundingClientRect();
  const canvasX = event.clientX - rect.left;
  const canvasY = event.clientY - rect.top;

  // Handle timeline dragging
  if (isDraggingTimeline.value) {
    const deltaX = dragStartX.value - canvasX;
    const deltaY = dragStartY.value - canvasY;

    // Mark as dragged if moved more than threshold
    if (Math.abs(deltaX) > DRAG_THRESHOLD_PIXELS || Math.abs(deltaY) > DRAG_THRESHOLD_PIXELS) {
      hasDragged.value = true;
    }

    // Update horizontal scroll via scrollbar
    if (horizontalScrollBar.value) {
      const canvasWidth = app.value.screen.width;
      const scrollbarWidth = canvasWidth - CHANNEL_LIST_WIDTH;
      const maxScrollX = Math.max(0, TIMELINE_WIDTH.value - scrollbarWidth);
      const newWorldX = Math.max(0, Math.min(dragStartWorldX.value + deltaX, maxScrollX));
      currentWorldX.value = newWorldX;
      const newOffset = maxScrollX > 0 ? newWorldX / maxScrollX : 0;

      // Update scrollbar thumb position
      horizontalScrollBar.value.setDragging(true);
      const maxThumbX = scrollbarWidth - horizontalScrollBar.value.thumbSize;
      const thumbX = CHANNEL_LIST_WIDTH + newOffset * maxThumbX;
      horizontalScrollOffset.value = horizontalScrollBar.value.drag(thumbX);
      horizontalScrollBar.value.endDrag();
    }

    // Update vertical scroll via scrollbar
    if (verticalScrollBar.value) {
      const canvasHeight = app.value.screen.height;
      const availableHeight = canvasHeight - ADD_CHANNEL_BUTTON_HEIGHT;
      const totalContentHeight = channels.value.length * ROW_HEIGHT;
      const maxScrollY = Math.max(0, totalContentHeight - availableHeight);
      const newWorldY = Math.max(0, Math.min(dragStartWorldY.value + deltaY, maxScrollY));
      currentWorldY.value = newWorldY;
      const newOffset = maxScrollY > 0 ? newWorldY / maxScrollY : 0;

      // Update scrollbar thumb position
      verticalScrollBar.value.setDragging(true);
      const maxThumbY = availableHeight - verticalScrollBar.value.thumbSize;
      const thumbY = ADD_CHANNEL_BUTTON_HEIGHT + newOffset * maxThumbY;
      verticalScrollOffset.value = verticalScrollBar.value.drag(thumbY);
      verticalScrollBar.value.endDrag();
    }
  }

  // Handle scrollbar thumb dragging
  if (horizontalScrollBar.value?.isDragging()) {
    horizontalScrollOffset.value = horizontalScrollBar.value.drag(canvasX);
  }

  if (verticalScrollBar.value?.isDragging()) {
    verticalScrollOffset.value = verticalScrollBar.value.drag(canvasY);
  }
}

function handleGlobalMouseUp() {
  if (isDraggingTimeline.value) {
    isDraggingTimeline.value = false;
  }

  horizontalScrollBar.value?.endDrag();

  verticalScrollBar.value?.endDrag();
}

function handleWheel(event: WheelEvent) {
  event.preventDefault();

  // Check if mouse is over timeline specifically (right of channel list, in the timeline height area)
  const isOverTimeline =
    !event.ctrlKey &&
    pixiContainer.value &&
    event.offsetX >= CHANNEL_LIST_WIDTH &&
    event.offsetY >= SCROLL_BAR_HEIGHT &&
    event.offsetY < ADD_CHANNEL_BUTTON_HEIGHT;

  // Check if Ctrl key is held OR mouse is over timeline - if so, zoom instead of scroll
  if (event.ctrlKey || isOverTimeline) {
    // Accumulate scroll delta
    if (event.deltaY < 0) {
      zoomScrollAccumulator.value--;
    } else if (event.deltaY > 0) {
      zoomScrollAccumulator.value++;
    }

    // Check if we've accumulated required scroll events
    if (zoomScrollAccumulator.value <= -ZOOM_SCROLL_TICKS_REQUIRED) {
      // Scroll up = zoom in
      zoom('in');
      zoomScrollAccumulator.value = 0;
    } else if (zoomScrollAccumulator.value >= ZOOM_SCROLL_TICKS_REQUIRED) {
      // Scroll down = zoom out
      zoom('out');
      zoomScrollAccumulator.value = 0;
    }
    return;
  }

  if (!app.value || !verticalScrollBar.value) return;

  const canvasHeight = app.value.screen.height;
  const availableHeight = canvasHeight - ADD_CHANNEL_BUTTON_HEIGHT;
  const totalContentHeight = channels.value.length * ROW_HEIGHT;
  const maxScrollY = Math.max(0, totalContentHeight - availableHeight);

  // Only scroll if there's content to scroll
  if (maxScrollY <= 0) return;

  // Adjust scroll speed (pixels per wheel delta)
  const scrollSpeed = 0.5;
  const scrollDelta = event.deltaY * scrollSpeed;

  // Calculate new world Y position
  const newWorldY = Math.max(0, Math.min(currentWorldY.value + scrollDelta, maxScrollY));
  currentWorldY.value = newWorldY;

  verticalScrollOffset.value = newWorldY / maxScrollY;
  verticalScrollBar.value.setDragging(true);
  verticalScrollBar.value?.drag(verticalScrollOffset.value * (canvasHeight - ADD_CHANNEL_BUTTON_HEIGHT));
  verticalScrollBar.value.endDrag();
}



function handleResize() {
  if (!app.value || !pixiContainer.value || !horizontalScrollBar.value) return;

  // Force a reflow to get accurate dimensions
  const containerWidth = pixiContainer.value.getBoundingClientRect().width;
  const containerHeight = pixiContainer.value.getBoundingClientRect().height;

  // Resize the canvas using getBoundingClientRect for accuracy
  app.value.renderer.resize(Math.floor(containerWidth) || 800, Math.floor(containerHeight) || 600);

  const newCanvasWidth = app.value.screen.width;
  const scrollbarWidth = newCanvasWidth - CHANNEL_LIST_WIDTH;

  // Update the thumb width based on new scrollbar size
  //const viewportRatio = scrollbarWidth / TIMELINE_WIDTH.value;
  //const newThumbWidth = Math.max(MIN_SCROLL_THUMB_WIDTH, scrollbarWidth * viewportRatio);

  //horizontalScrollThumbWidth.value = newThumbWidth;

  // Calculate new scroll offset based on the stored world position
  const newMaxScroll = Math.max(0, TIMELINE_WIDTH.value - scrollbarWidth);

  // If the viewport is now larger than or equal to the timeline, reset to start
  if (newMaxScroll <= 0) {
    horizontalScrollOffset.value = 0;
    currentWorldX.value = 0;
  } else {
    // Clamp the world position to not exceed the new maximum scroll
    const clampedWorldX = Math.min(currentWorldX.value, newMaxScroll);
    currentWorldX.value = clampedWorldX; // Update this FIRST
    horizontalScrollOffset.value = clampedWorldX / newMaxScroll;
    // Manually update the container position since watch might not trigger if scrollOffset doesn't change
    if (scrollableContentContainer.value) {
      scrollableContentContainer.value.x = CHANNEL_LIST_WIDTH - clampedWorldX;
    }
    if (timeline.value) {
      timeline.value.x = CHANNEL_LIST_WIDTH - clampedWorldX;
    }
  }

  updateHorizontalScrollbar();
  updateVerticalScrollbar();
  updateZoomButtonPositions();
  createChannelList();
}

function updateHorizontalScrollbar() {
  if (!app.value || !horizontalScrollBar.value) return;

  const canvasWidth = app.value.screen.width;
  const scrollbarWidth = canvasWidth - CHANNEL_LIST_WIDTH;

  const viewportRatio = scrollbarWidth / TIMELINE_WIDTH.value;
  const newThumbWidth = Math.max(MIN_SCROLL_THUMB_WIDTH, scrollbarWidth * viewportRatio);

  horizontalScrollBar.value.resize(
    scrollbarWidth,
    newThumbWidth,
    0,
    horizontalScrollOffset.value);
}

function updateVerticalScrollbar() {
  if (!app.value || !verticalScrollBar.value) return;

  const canvasHeight = app.value.screen.height;
  const scrollbarHeight = canvasHeight - ADD_CHANNEL_BUTTON_HEIGHT;
  const totalContentHeight = channels.value.length * ROW_HEIGHT;
  const availableHeight = scrollbarHeight;

  // Calculate thumb height based on content ratio
  const viewportRatio = availableHeight / totalContentHeight;
  const newThumbHeight = Math.max(
    MIN_VERTICAL_SCROLL_THUMB_HEIGHT,
    scrollbarHeight * viewportRatio,
  );

  verticalScrollBar.value.resize(
    scrollbarHeight,
    newThumbHeight,
    app.value.screen.width - VERTICAL_SCROLL_BAR_WIDTH,
    verticalScrollOffset.value);
}

function updateZoomButtonPositions() {
  if (!app.value || !plusButton.value || !minusButton.value) return;

  const canvasWidth = app.value.screen.width;
  const buttonRadius = 15;
  const buttonSpacing = 8;
  const rightMargin = VERTICAL_SCROLL_BAR_WIDTH + 10;
  const topMargin = SCROLL_BAR_HEIGHT + 10;

  plusButton.value.x = canvasWidth - rightMargin - buttonRadius * 4 - buttonSpacing;
  plusButton.value.y = topMargin;

  minusButton.value.x = canvasWidth - rightMargin - buttonRadius * 2;
  minusButton.value.y = topMargin;
}

function createChannelRowContainer(channelId: number, rowIndex: number) {
  if (!scrollableContentContainer.value || !app.value) return;

  // Create a container for this channel row
  const rowContainer = new Container();
  rowContainer.x = 0; // Aligned with timeline
  rowContainer.y = rowIndex * ROW_HEIGHT;
  rowContainer.eventMode = 'static';
  rowContainer.cursor = 'pointer';

  // Draw the row background
  const rowBg = new Graphics();
  const rowColor = rowIndex % 2 === 0 ? 0x2a2a2a : 0x1a1a1a;
  rowBg.rect(0, 0, TIMELINE_WIDTH.value, ROW_HEIGHT).fill(rowColor);

  // Add border
  rowBg.rect(0, ROW_HEIGHT - 1, TIMELINE_WIDTH.value, 1).fill(0x444444);

  rowContainer.addChild(rowBg);

  // Add click handler to create red box at click position
  rowContainer.on('pointertap', (event) => {
    // Only create box with left mouse button
    if (event.button !== 0) return;

    // Don't create box if user was dragging timeline or event box
    if (hasDragged.value || hasEventBoxDragged.value) {
      hasEventBoxDragged.value = false; // Reset flag
      return;
    }

    if (!scrollableContentContainer.value || !app.value) return;

    // Get the local position within the row container
    const localPos = rowContainer.toLocal(event.global);

    // Calculate the time in seconds based on pixel position
    const timeInSeconds = (localPos.x / TIMELINE_WIDTH.value) * TIMELINE_DURATION_SECONDS;

    // Create and store the event box
    addEventBox(rowContainer, channelId, timeInSeconds, app, isDraggingTimeline);
  });

  scrollableContentContainer.value.addChild(rowContainer as any);

  // Store the container in the map
  channelRowContainers.value.set(channelId, rowContainer);

  // Update positions of any existing event boxes for this channel
  updateEventBoxPositions(channelId);
}

function updateAllRowBackgrounds() {
  // Skip if backgrounds haven't changed
  if (!rowBackgroundsDirty.value) return;

  // Update background width for all channel rows
  channelRowContainers.value.forEach((rowContainer, channelId) => {
    // The first child is the background graphics
    if (rowContainer.children.length > 0) {
      const rowBg = rowContainer.children[0] as Graphics;
      const rowIndex = Array.from(channelRowContainers.value.keys()).indexOf(channelId);
      const rowColor = rowIndex % 2 === 0 ? 0x2a2a2a : 0x1a1a1a;

      rowBg.clear();
      rowBg.rect(0, 0, TIMELINE_WIDTH.value, ROW_HEIGHT).fill(rowColor);
      rowBg.rect(0, ROW_HEIGHT - 1, TIMELINE_WIDTH.value, 1).fill(0x444444);
    }
  });

  // Clear dirty flag
  rowBackgroundsDirty.value = false;
}

function addChannel() {
  const newChannel: Channel = {
    id: channels.value.length + 1,
    name: `Channel ${channels.value.length + 1}`,
    events: [],
  };
  channels.value.push(newChannel);

  // Create the corresponding row container under the timeline
  createChannelRowContainer(newChannel.id, channels.value.length - 1);

  // Update vertical scrollbar to account for new content
  updateVerticalScrollbar();

  // Recreate the channel list UI
  createChannelList();
}
</script>

<template>
  <AstrosLayout>
    <template v-slot:main>
      <div class="h-full w-full overflow-hidden flex flex-col">
        <div id="scripter" class="flex-1 min-h-0 border border-gray-300 m-4">
          <div ref="pixiContainer" class="w-full h-full bg-black"></div>
        </div>
      </div>
    </template>
  </AstrosLayout>
</template>
