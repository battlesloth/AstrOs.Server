<script setup lang="ts">
import { Application, Container, Graphics } from 'pixi.js';
import { onUnmounted, ref, watch } from 'vue';

// Import composables
import { useZoomState, ZOOM_LEVELS } from '@/composables/useZoomState';
import { useScrollState } from '@/composables/useScrollState';
import { useDragState } from '@/composables/useDragState';
import { useEventBoxes } from '@/composables/useEventBoxes';

import {
  ROW_HEIGHT,
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
} from '@/composables/timelineConstants';
import type { Channel } from '@/models';

// Import utilities
import { createCircularButton, drawPlusIcon, drawMinusIcon } from '@/pixiComponents/pixiButtons';
import {
  calculateMaxScroll,
  calculateScrollOffset,
  calculateWorldPosition,
  clampWorldPosition,
  calculateViewportRatio,
  calculateThumbSize,
} from '@/utils/scrollCalculations';
import { PixiScrollBar } from '@/pixiComponents/pixiScrollBar';
import { ScrollBarDirection } from '@/pixiComponents/pixiScrollBarOptions';
import { PixiChannelData } from '@/pixiComponents/pixiChannelData';
import { loadAssets } from '@/pixiComponents/assets/assetLoader';
import {
  PixiChannelEventRow,
  type PixiChannelEventRowOptions,
} from '@/pixiComponents/pixiChannelEventRow';
import { PixiTimeline, type PixiTimelineOptions } from '@/pixiComponents/pixiTimeline';
import { PixiChannelList } from '@/pixiComponents/pixiChannelList';
import { ScriptChannelType } from '@/enums';
import type { ScriptEvent } from '@/models';

// ============================================================================
// APPLICATION REFS
// ============================================================================

const app = ref<Application | null>(null);
const pixiContainer = ref<HTMLDivElement | null>(null);
const channels = ref<Channel[]>([]);

// ============================================================================
// PIXI CONTAINERS & GRAPHICS REFS
// ============================================================================

const mainContainer = ref<Container | null>(null);
const scrollableContentContainer = ref<Container | null>(null);
const uiLayer = ref<Container | null>(null);
const channelListContainer = ref<PixiChannelList | null>(null);
const timeline = ref<PixiTimeline | null>(null);
const channelRowContainers = ref(new Map<string, PixiChannelEventRow>());

// Scrollbar graphics
const horizontalScrollBar = ref<PixiScrollBar | null>(null);
const verticalScrollBar = ref<PixiScrollBar | null>(null);

// UI buttons
const plusButton = ref<Container | null>(null);
const minusButton = ref<Container | null>(null);

// ============================================================================
// Exposed Methods
// ============================================================================

const initializePixi = async (scriptChannels: Channel[]) => {
  await init();
  for (const channel of scriptChannels) {
    addChannel(channel);
  }
};

const addChannel = (channel: Channel) => {
  console.log('adding channel', channel);
  doAddChannel(channel);
  if (channel.events.length > 0) {
    for (const event of channel.events) {
      addEvent(event, channel.channelType);
    }
  }
};

const removeChannel = (chId: string) => {
  doRemoveChannel(chId);
};

const swapChannel = (chA: Channel, chB: Channel) => {
  doSwapChannel(chA, chB);
};

const addEvent = (event: ScriptEvent, scriptChannelType: ScriptChannelType) => {
  doAddEvent(event, scriptChannelType);
};

const removeEvent = (chlId: string, eventId: string) => {
  doRemoveEvent(chlId, eventId);
};

const updateEvent = (chlId: string, eventId: string) => {
  console.log('updating event', eventId, 'from channel', chlId);

  // Rebuild the event box to reflect updated visual properties
  rebuildEventBox(chlId, eventId);

  // Also update positions in case time changed
  updateEventBoxPositions(chlId);
};

defineExpose({
  initializePixi,
  addChannel,
  removeChannel,
  swapChannel,
  addEvent,
  removeEvent,
  updateEvent,
});

// ============================================================================
// emitters
// ===========================================================================

const emit = defineEmits<{
  (e: 'addChannel'): void;
  (e: 'removeChannel', chId: string, name: string): void;
  (e: 'swapChannel', chId: string, type: ScriptChannelType): void;
  (e: 'testChannel', chId: string): void;
  (e: 'addEvent', chlId: string, time: number): void;
  (e: 'removeEvent', chlId: string, eventId: number): void;
  (e: 'editEvent', event: ScriptEvent): void;
}>();

function emitAddChannel() {
  emit('addChannel');
}
function emitChannelDelete(chId: string, name: string) {
  emit('removeChannel', chId, name);
}

function emitChannelSwap(chId: string, type: ScriptChannelType) {
  emit('swapChannel', chId, type);
}

function emitChannelTest(chId: string) {
  emit('testChannel', chId);
}

function emitAddEvent(chlId: string, time: number) {
  emit('addEvent', chlId, time);
}
//function emitRemoveEvent(chlId: string, eventId: number) {
//  emit('removeEvent', chlId, eventId);
//}
function emitEditEvent(event: ScriptEvent) {
  emit('editEvent', event);
}

// ============================================================================
// STATE (using composables)
// ============================================================================

const { zoomLevel, zoomScrollAccumulator, TIMELINE_WIDTH } = useZoomState(
  PIXELS_PER_SECOND,
  TIMELINE_DURATION_SECONDS,
);

const {
  horizontalScrollOffset,
  currentWorldX,
  verticalScrollOffset,
  currentWorldY,
  updateHorizontalScrollByDelta,
  updateVerticalScrollByDelta,
  clampHorizontalScroll,
  clampVerticalScroll,
  updateVerticalScrollByWheel,
} = useScrollState();

const { isDraggingTimeline, dragStartX, dragStartY, dragStartWorldX, dragStartWorldY, hasDragged } =
  useDragState();

// Performance optimization flags
const eventBoxPositionsDirty = ref(false);
const rowBackgroundsDirty = ref(false);
const lastTimelineWidth = ref(
  (PIXELS_PER_SECOND * TIMELINE_DURATION_SECONDS) / ZOOM_LEVELS[0]!.scaleMultiplier,
);

// Event boxes composable
const {
  hasEventBoxDragged,
  addEventBox,
  removeEventBox,
  rebuildEventBox,
  updateEventBoxPositions,
  updateAllEventBoxPositions,
  handleEventBoxDrag,
  endEventBoxDrag,
} = useEventBoxes(TIMELINE_WIDTH, TIMELINE_DURATION_SECONDS, ROW_HEIGHT, (event) => {
  emitEditEvent(event);
});

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
    const maxScroll = calculateMaxScroll(TIMELINE_WIDTH.value, scrollbarWidth);
    const worldX = calculateWorldPosition(newOffset, maxScroll);
    currentWorldX.value = worldX; // Store current world position

    // Apply horizontal scroll to scrollable content and timeline
    updateContainerPositions(worldX, currentWorldY.value);

    // Update scrollbar thumb position if not currently being dragged
    if (horizontalScrollBar.value && !horizontalScrollBar.value.isDragging()) {
      horizontalScrollBar.value.updateThumbFromOffset(newOffset);
    }
  }
});

// Watch vertical scroll offset and update container Y position
watch(verticalScrollOffset, (newOffset) => {
  if (scrollableContentContainer.value && app.value) {
    const canvasHeight = app.value.screen.height;
    const availableHeight = canvasHeight - ADD_CHANNEL_BUTTON_HEIGHT;
    const totalContentHeight = channels.value.length * ROW_HEIGHT;
    const maxScrollY = calculateMaxScroll(totalContentHeight, availableHeight);
    const worldY = calculateWorldPosition(newOffset, maxScrollY);
    currentWorldY.value = worldY;

    // Apply vertical scroll to scrollable content
    updateContainerPositions(currentWorldX.value, worldY);

    // Update scrollbar thumb position if not currently being dragged
    if (verticalScrollBar.value && !verticalScrollBar.value.isDragging()) {
      verticalScrollBar.value.updateThumbFromOffset(newOffset);
    }
  }
});

// ============================================================================
// Initialize / Unmounted
// ============================================================================

async function init() {
  if (!pixiContainer.value) return;

  console.log('AstrosPixiView mounted, initializing PIXI...');

  app.value = new Application();

  await loadAssets();

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
  app.value.stage.eventMode = 'static';
  app.value.stage.addChild(mainContainer.value as Container);

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

    // Change cursor to grabbing
    if (app.value?.canvas) {
      app.value.canvas.style.cursor = 'grabbing';
    }
  });

  mainContainer.value.addChild(scrollableContentContainer.value as Container);

  // Create UI layer (always on top)
  uiLayer.value = new Container();
  app.value.stage.addChild(uiLayer.value as Container);
  createHorizontalScrollbar();
  createVerticalScrollbar();
  createTimeline();
  createZoomButtons();
  createChannelList();

  uiLayer.value.addChild(channelListContainer.value as unknown as Container);

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
  window.addEventListener('mouseup', (event) => handleGlobalMouseUp(event));

  // Add wheel event listener for scrolling
  if (pixiContainer.value) {
    pixiContainer.value.addEventListener('wheel', handleWheel, { passive: false });
  }

  console.log('PIXI initialized.');
}

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
  horizontalScrollBar.value = null;
  timeline.value = null;
  verticalScrollBar.value = null;
  channelRowContainers.value.clear();
});

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

// ============================================================================
// Create UI Components
// ============================================================================

function createHorizontalScrollbar() {
  if (!app.value || !uiLayer.value) return;

  const barWidth = app.value.screen.width - CHANNEL_LIST_WIDTH;
  const viewportRatio = calculateViewportRatio(barWidth, TIMELINE_WIDTH.value);
  const thumbSize = calculateThumbSize(barWidth, viewportRatio, MIN_SCROLL_THUMB_WIDTH);

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
  };

  horizontalScrollBar.value = new PixiScrollBar(options);
  uiLayer.value.addChild(horizontalScrollBar.value as unknown as Container);
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
  };

  verticalScrollBar.value = new PixiScrollBar(options);

  uiLayer.value.addChild(verticalScrollBar.value as unknown as Container);
}

function createTimeline() {
  if (!app.value || !uiLayer.value) return;

  const timelineOptions: PixiTimelineOptions = {
    xOffset: CHANNEL_LIST_WIDTH,
    yOffset: SCROLL_BAR_HEIGHT,
    width: TIMELINE_WIDTH.value,
    height: TIMELINE_HEIGHT,
    duration: TIMELINE_DURATION_SECONDS,
    zoomLevel: zoomLevel.value,
    pixelsPerMajorTick: PIXELS_PER_MAJOR_TICK,
  };

  const timelineInstance = new PixiTimeline(timelineOptions);
  timeline.value = timelineInstance;
  uiLayer.value.addChild(timeline.value as unknown as Container);
}

function createZoomButtons() {
  if (!app.value || !uiLayer.value) return;

  const canvasWidth = app.value.screen.width;
  const positions = getZoomButtonPositions(canvasWidth);

  // Create buttons (minus on left, plus on right)
  minusButton.value = createCircularButton(
    positions.plus.x,
    positions.plus.y,
    positions.radius,
    drawMinusIcon,
    () => zoom('out'),
  );

  plusButton.value = createCircularButton(
    positions.minus.x,
    positions.minus.y,
    positions.radius,
    drawPlusIcon,
    () => zoom('in'),
  );

  uiLayer.value.addChild(plusButton.value as unknown as Container);
  uiLayer.value.addChild(minusButton.value as unknown as Container);
}

function createChannelList() {
  if (!app.value) return;

  const canvasHeight = app.value.screen.height;

  if (channelListContainer.value == null) {
    channelListContainer.value = new PixiChannelList({
      width: CHANNEL_LIST_WIDTH,
      height: canvasHeight,
      buttonHeight: ADD_CHANNEL_BUTTON_HEIGHT,
      emitAddChannel: emitAddChannel,
    });
  } else {
    channelListContainer.value.redraw(canvasHeight);
  }

  channels.value.forEach((channel, index) => {
    const options = {
      channelId: channel.id.toString(),
      channelName: channel.name,
      channelType: channel.channelType,
      rowIdx: index,
      height: ROW_HEIGHT,
      width: CHANNEL_LIST_WIDTH,
      onSwap: emitChannelSwap,
      onTest: emitChannelTest,
      onDelete: emitChannelDelete,
    };

    const channelData = new PixiChannelData(options);

    channelListContainer.value?.addChannelRow(channelData);
  });
}

function createChannelRowContainer(
  channelId: string,
  channelType: ScriptChannelType,
  rowIndex: number,
) {
  if (!scrollableContentContainer.value || !app.value) return;

  const options: PixiChannelEventRowOptions = {
    channelId: channelId,
    channelType: channelType,
    rowIdx: rowIndex,
    height: ROW_HEIGHT,
    timeLineDuration: TIMELINE_DURATION_SECONDS,
    timeLineWidth: TIMELINE_WIDTH,
    hasDragged: hasDragged,
    hasEventBoxDragged: hasEventBoxDragged,
    resetDraggedFlag: () => {
      hasEventBoxDragged.value = false;
    },
    onClick: emitAddEvent,
  };

  const eventRow = new PixiChannelEventRow(options);

  scrollableContentContainer.value.addChild(eventRow as unknown as Container);

  // @ts-expect-error - Vue ref unwrapping causes type incompatibility with nested Ref types
  channelRowContainers.value.set(channelId, eventRow);

  // Update positions of any existing event boxes for this channel
  updateEventBoxPositions(channelId);
}

function doAddChannel(channel: Channel) {
  const newIndex = channels.value.length;
  channels.value.push(channel);

  // Create the corresponding row container under the timeline
  createChannelRowContainer(channel.id, channel.channelType, newIndex);
  // Update vertical scrollbar to account for new content
  updateVerticalScrollbar();

  const options = {
    channelId: channel.id,
    channelName: channel.name,
    channelType: channel.channelType,
    rowIdx: newIndex,
    height: ROW_HEIGHT,
    width: CHANNEL_LIST_WIDTH,
    onSwap: emitChannelSwap,
    onTest: emitChannelTest,
    onDelete: emitChannelDelete,
  };

  const channelData = new PixiChannelData(options);
  channelListContainer.value?.addChannelRow(channelData);

  // Update the background height to accommodate the new channel
  if (channelListContainer.value && channelListContainer.value.children[0]) {
    const background = channelListContainer.value.children[0] as Graphics;
    if (app.value) {
      background.clear().rect(0, 0, CHANNEL_LIST_WIDTH, app.value.screen.height).fill(0x2a2a2a);
    }
  }
}

function doRemoveChannel(chId: string) {
  const channelIndex = channels.value.findIndex((ch) => ch.id === chId);
  if (channelIndex === -1) {
    console.error('Channel not found for ID:', chId);
    return;
  }

  channels.value.splice(channelIndex, 1);

  // Remove the corresponding row container under the timeline
  const rowContainer = channelRowContainers.value.get(chId);
  if (rowContainer && scrollableContentContainer.value) {
    scrollableContentContainer.value.removeChild(rowContainer as unknown as Container);
    channelRowContainers.value.delete(chId);
  }

  channelListContainer.value?.removeChannelRow(chId);

  // Update remaining row indices to match their position in the channels array
  channels.value.forEach((channel, index) => {
    const rowContainer = channelRowContainers.value.get(channel.id);
    if (rowContainer && rowContainer.rowIdx !== index) {
      // Calculate the difference and update
      rowContainer.updateIdx(index);
      channelListContainer.value?.updateChannelIndex(channel.id, index);
    }
  });

  // Update vertical scrollbar to account for removed content
  updateVerticalScrollbar();

  // Update the background height to accommodate the removed channel
  if (channelListContainer.value && channelListContainer.value.children[0]) {
    const background = channelListContainer.value.children[0] as Graphics;
    if (app.value) {
      background.clear().rect(0, 0, CHANNEL_LIST_WIDTH, app.value.screen.height).fill(0x2a2a2a);
    }
  }
}

function doSwapChannel(chA: Channel, chB: Channel) {
  const indexA = channels.value.findIndex((ch) => ch.id === chA.id);
  const indexB = channels.value.findIndex((ch) => ch.id === chB.id);

  if (indexA === -1) {
    console.error('Channels not found for swap:', chA.id, chB.id);
    return;
  }

  channels.value[indexA]!.name = chB.name;

  channelListContainer.value?.updateChannel(chA.id, chB.name);

  if (indexB === -1) {
    console.log('swapped Channel A out for Channel B');
    return;
  }

  channels.value[indexB]!.name = chA.name;

  channelListContainer.value?.updateChannel(chB.id, chA.name);
}

function doAddEvent(event: ScriptEvent, scriptChannelType: ScriptChannelType) {
  const rowContainer = channelRowContainers.value.get(event.scriptChannel);
  if (!rowContainer || !app.value) {
    console.error('Channel row container not found for channel ID:', event.scriptChannel);
    return;
  }
  addEventBox(
    rowContainer as unknown as Container,
    event.scriptChannel,
    event,
    scriptChannelType,
    isDraggingTimeline,
  );
}

function doRemoveEvent(chlId: string, eventId: string) {
  const rowContainer = channelRowContainers.value.get(chlId);
  if (!rowContainer) {
    console.error('Channel row container not found for channel ID:', chlId);
    return;
  }

  removeEventBox(chlId, eventId);
}

// ============================================================================
// UI Update Functions
// ============================================================================

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
    const oldMaxScroll = calculateMaxScroll(oldTimelineWidth, scrollbarWidth);

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
    const newMaxScroll = calculateMaxScroll(TIMELINE_WIDTH.value, scrollbarWidth);

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
        currentWorldX.value = clampWorldPosition(newWorldX, newMaxScroll);
        horizontalScrollOffset.value = calculateScrollOffset(currentWorldX.value, newMaxScroll);
      }
    } else {
      currentWorldX.value = 0;
      horizontalScrollOffset.value = 0;
    }
  }

  // Recreate timeline with new scale
  if (timeline.value && uiLayer.value) {
    uiLayer.value.removeChild(timeline.value as unknown as Container);
    timeline.value = null;
  }

  createTimeline();

  // Re-add buttons and channel list so they stay on top of timeline
  if (plusButton.value && minusButton.value && uiLayer.value) {
    uiLayer.value.removeChild(plusButton.value as unknown as Container);
    uiLayer.value.removeChild(minusButton.value as unknown as Container);
    uiLayer.value.addChild(plusButton.value as unknown as Container);
    uiLayer.value.addChild(minusButton.value as unknown as Container);
  }

  // Re-add channel list container so it stays on top
  if (channelListContainer.value && uiLayer.value) {
    uiLayer.value.removeChild(channelListContainer.value as unknown as Container);
    uiLayer.value.addChild(channelListContainer.value as unknown as Container);
  }

  // Update scrollbar to match new timeline width
  updateHorizontalScrollbar();

  // Update the timeline and scrollable content positions based on new scroll values
  if (app.value) {
    const canvasWidth = app.value.screen.width;
    const scrollbarWidth = canvasWidth - CHANNEL_LIST_WIDTH;
    const maxScroll = calculateMaxScroll(TIMELINE_WIDTH.value, scrollbarWidth);
    const worldX = calculateWorldPosition(horizontalScrollOffset.value, maxScroll);
    currentWorldX.value = worldX;
    updateContainerPositions(worldX, currentWorldY.value);
  }

  // Update all event box positions based on new timeline width
  updateAllEventBoxPositions();

  // Update all row backgrounds based on new timeline width
  updateAllRowBackgrounds();
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

  // Calculate new scroll offset based on the stored world position
  const newMaxScroll = calculateMaxScroll(TIMELINE_WIDTH.value, scrollbarWidth);

  // If the viewport is now larger than or equal to the timeline, reset to start
  if (newMaxScroll <= 0) {
    horizontalScrollOffset.value = 0;
    currentWorldX.value = 0;
  } else {
    // Clamp the world position to not exceed the new maximum scroll
    const clampedWorldX = clampHorizontalScroll({
      contentSize: TIMELINE_WIDTH.value,
      viewportSize: scrollbarWidth,
    });
    // Manually update the container position since watch might not trigger if scrollOffset doesn't change
    updateContainerPositions(clampedWorldX, currentWorldY.value);
  }

  // Handle vertical scroll clamping on resize
  const canvasHeight = app.value.screen.height;
  const availableHeight = canvasHeight - ADD_CHANNEL_BUTTON_HEIGHT;
  const totalContentHeight = channels.value.length * ROW_HEIGHT;
  const newMaxScrollY = calculateMaxScroll(totalContentHeight, availableHeight);

  // If the viewport is now larger than or equal to the content, reset to top
  if (newMaxScrollY <= 0) {
    verticalScrollOffset.value = 0;
    currentWorldY.value = 0;
  } else {
    // Clamp the world position to not exceed the new maximum scroll
    const clampedWorldY = clampVerticalScroll({
      contentSize: totalContentHeight,
      viewportSize: availableHeight,
    });
    // Manually update the container position since watch might not trigger if scrollOffset doesn't change
    updateContainerPositions(currentWorldX.value, clampedWorldY);
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

  const viewportRatio = calculateViewportRatio(scrollbarWidth, TIMELINE_WIDTH.value);
  const newThumbWidth = calculateThumbSize(scrollbarWidth, viewportRatio, MIN_SCROLL_THUMB_WIDTH);

  horizontalScrollBar.value.resize(scrollbarWidth, newThumbWidth, 0, horizontalScrollOffset.value);
}

function updateVerticalScrollbar() {
  if (!app.value || !verticalScrollBar.value) return;

  const canvasHeight = app.value.screen.height;
  const scrollbarHeight = canvasHeight - ADD_CHANNEL_BUTTON_HEIGHT;
  const totalContentHeight = channels.value.length * ROW_HEIGHT;
  const availableHeight = scrollbarHeight;

  // Calculate thumb height based on content ratio
  const viewportRatio = calculateViewportRatio(availableHeight, totalContentHeight);
  const newThumbHeight = calculateThumbSize(
    scrollbarHeight,
    viewportRatio,
    MIN_VERTICAL_SCROLL_THUMB_HEIGHT,
  );

  verticalScrollBar.value.resize(
    scrollbarHeight,
    newThumbHeight,
    app.value.screen.width - VERTICAL_SCROLL_BAR_WIDTH,
    verticalScrollOffset.value,
  );
}

function updateZoomButtonPositions() {
  if (!app.value || !plusButton.value || !minusButton.value) return;

  const canvasWidth = app.value.screen.width;
  const positions = getZoomButtonPositions(canvasWidth);

  plusButton.value.x = positions.plus.x;
  plusButton.value.y = positions.plus.y;

  minusButton.value.x = positions.minus.x;
  minusButton.value.y = positions.minus.y;
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

// ============================================================================
// Mouse Handlers
// ============================================================================

function handleGlobalMouseMove(event: MouseEvent) {
  if (!app.value || !pixiContainer.value) return;

  const rect = pixiContainer.value.getBoundingClientRect();
  const canvasX = event.clientX - rect.left;
  const canvasY = event.clientY - rect.top;

  // Handle timeline dragging (grab and drag to scroll)
  if (isDraggingTimeline.value) {
    const deltaX = dragStartX.value - canvasX;
    const deltaY = dragStartY.value - canvasY;

    // Mark as dragged if moved more than threshold
    if (Math.abs(deltaX) > DRAG_THRESHOLD_PIXELS || Math.abs(deltaY) > DRAG_THRESHOLD_PIXELS) {
      hasDragged.value = true;
    }

    // Calculate horizontal scroll offset
    const canvasWidth = app.value.screen.width;
    const scrollbarWidth = canvasWidth - CHANNEL_LIST_WIDTH;
    updateHorizontalScrollByDelta(
      deltaX,
      {
        contentSize: TIMELINE_WIDTH.value,
        viewportSize: scrollbarWidth,
      },
      dragStartWorldX.value,
    );

    // Calculate vertical scroll offset
    const canvasHeight = app.value.screen.height;
    const availableHeight = canvasHeight - ADD_CHANNEL_BUTTON_HEIGHT;
    const totalContentHeight = channels.value.length * ROW_HEIGHT;
    updateVerticalScrollByDelta(
      deltaY,
      {
        contentSize: totalContentHeight,
        viewportSize: availableHeight,
      },
      dragStartWorldY.value,
    );
  }

  if (horizontalScrollBar.value?.isDragging()) {
    horizontalScrollOffset.value = horizontalScrollBar.value.drag(canvasX);
  }

  if (verticalScrollBar.value?.isDragging()) {
    verticalScrollOffset.value = verticalScrollBar.value.drag(canvasY);
  }
}

function handleGlobalMouseUp(event?: MouseEvent) {
  if (isDraggingTimeline.value) {
    isDraggingTimeline.value = false;

    // Check what's under the cursor and set appropriate cursor
    if (app.value?.canvas && pixiContainer.value && event) {
      const rect = pixiContainer.value.getBoundingClientRect();
      const canvasX = event.clientX - rect.left;
      const canvasY = event.clientY - rect.top;

      // Check if cursor is over a channel row (in the scrollable content area)
      const isOverChannelRows =
        canvasX >= CHANNEL_LIST_WIDTH && canvasY >= ADD_CHANNEL_BUTTON_HEIGHT;

      app.value.canvas.style.cursor = isOverChannelRows ? 'pointer' : '';
    }

    // Reset the drag flag after a short delay to allow pointertap to check it first
    setTimeout(() => {
      hasDragged.value = false;
    }, 50);
  }

  horizontalScrollBar.value?.endDrag();

  verticalScrollBar.value?.endDrag();
}

function handleWheel(event: WheelEvent) {
  event.preventDefault();

  // Check if mouse is over timeline specifically
  const isOverTimeline =
    !event.ctrlKey &&
    pixiContainer.value &&
    event.offsetX >= CHANNEL_LIST_WIDTH &&
    event.offsetY >= SCROLL_BAR_HEIGHT &&
    event.offsetY < ADD_CHANNEL_BUTTON_HEIGHT;

  // Check if Ctrl key is held OR mouse is over timeline
  if (event.ctrlKey || isOverTimeline) {
    // Accumulate scroll delta
    if (event.deltaY < 0) {
      zoomScrollAccumulator.value--;
    } else if (event.deltaY > 0) {
      zoomScrollAccumulator.value++;
    }

    // Check if we've accumulated required scroll events
    if (zoomScrollAccumulator.value <= -ZOOM_SCROLL_TICKS_REQUIRED) {
      zoom('in');
      zoomScrollAccumulator.value = 0;
    } else if (zoomScrollAccumulator.value >= ZOOM_SCROLL_TICKS_REQUIRED) {
      zoom('out');
      zoomScrollAccumulator.value = 0;
    }
    return;
  }

  if (!app.value || !verticalScrollBar.value) return;

  const canvasHeight = app.value.screen.height;
  const availableHeight = canvasHeight - ADD_CHANNEL_BUTTON_HEIGHT;
  const totalContentHeight = channels.value.length * ROW_HEIGHT;

  // Use scroll state manager to handle wheel scrolling
  const didScroll = updateVerticalScrollByWheel(
    event.deltaY,
    {
      contentSize: totalContentHeight,
      viewportSize: availableHeight,
    },
    0.5,
  );

  if (!didScroll) return;
  verticalScrollBar.value.setDragging(true);
  verticalScrollBar.value?.drag(
    verticalScrollOffset.value * (canvasHeight - ADD_CHANNEL_BUTTON_HEIGHT),
  );
  verticalScrollBar.value.endDrag();
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function updateContainerPositions(worldX: number, worldY: number) {
  if (scrollableContentContainer.value) {
    scrollableContentContainer.value.x = CHANNEL_LIST_WIDTH - worldX;
    scrollableContentContainer.value.y = ADD_CHANNEL_BUTTON_HEIGHT - worldY;
  }

  if (timeline.value) {
    timeline.value.x = CHANNEL_LIST_WIDTH - worldX;
  }

  if (channelListContainer.value) {
    channelListContainer.value.setScrollableY(worldY);
  }
}

function getZoomButtonPositions(canvasWidth: number) {
  const buttonRadius = 15;
  const buttonSpacing = 8;
  const rightMargin = VERTICAL_SCROLL_BAR_WIDTH + 10;
  const topMargin = SCROLL_BAR_HEIGHT + 10;

  return {
    plus: {
      x: canvasWidth - rightMargin - buttonRadius * 4 - buttonSpacing,
      y: topMargin,
    },
    minus: {
      x: canvasWidth - rightMargin - buttonRadius * 2,
      y: topMargin,
    },
    radius: buttonRadius,
  };
}
</script>

<template>
  <div class="h-full w-full overflow-hidden flex flex-col">
    <div
      id="scripter"
      class="flex-1 min-h-0 border border-gray-300 m-4"
    >
      <div
        ref="pixiContainer"
        class="w-full h-full bg-black"
      ></div>
    </div>
  </div>
</template>
