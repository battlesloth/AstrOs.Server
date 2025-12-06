<script setup lang="ts">
import AstrosLayout from '@/components/layout/AstrosLayout.vue'
import { Application, Container, Graphics, HTMLText } from 'pixi.js';
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';

interface Channel {
  id: number;
  name: string;
  events: any[];
}

interface EventBox {
  channelId: number;
  timeInSeconds: number;
  graphics: Graphics;
}


const app = ref<Application | null>(null);
const pixiContainer = ref<HTMLDivElement | null>(null);
const channels = ref<Channel[]>([]);
const lastChannelClicked = ref<string>('None');

// element heights
const rowHeight = 60;
const timelineHeight = 50;
const scrollBarHeight = 15;
const addChannelButtonHeight = scrollBarHeight + timelineHeight; // Combined height of scrollbar and timeline

// UI layer containers
const mainContainer = ref<Container | null>(null);
const scrollableContentContainer = ref<Container | null>(null);
const uiLayer = ref<Container | null>(null);
const channelListContainer = ref<Container | null>(null);
const channelListScrollableContainer = ref<Container | null>(null);
const scrollBar = ref<Graphics | null>(null);
const scrollThumb = ref<Graphics | null>(null);
const timeline = ref<Container | null>(null);
const channelRowContainers = ref<Map<number, Container>>(new Map());
const channelEventBoxes = ref<Map<number, EventBox[]>>(new Map());
const plusButton = ref<Container | null>(null);
const minusButton = ref<Container | null>(null);

// Vertical scrollbar
const verticalScrollBar = ref<Graphics | null>(null);
const verticalScrollThumb = ref<Graphics | null>(null);
const verticalScrollBarWidth = 15;
const minVerticalScrollThumbHeight = 40;
const verticalScrollThumbHeight = ref(60);
const isDraggingVerticalThumb = ref(false);
const verticalScrollOffset = ref(0);
const currentWorldY = ref(0);

// Channel list dimensions
const channelListWidth = 256; // 64 * 4 = 256px

// Timeline constants
const PIXELS_PER_SECOND = 30;
const TIMELINE_DURATION_SECONDS = 600; // 10 minutes
const zoomLevel = ref(0); // 0=5s, 1=15s, 2=30s, 3=45s, 4=1min, 5=1:15, 6=1:30, 7=1:45, 8=2min
const zoomScrollAccumulator = ref(0); // Accumulate scroll events for zoom
// Initial width at zoom level 0 (scaleMultiplier = 0.5)
const TIMELINE_WIDTH = ref((PIXELS_PER_SECOND * TIMELINE_DURATION_SECONDS) / 0.5); // 36000 pixels

// Scrollbar state
const minScrollThumbWidth = 40; // Minimum thumb width
const scrollThumbWidth = ref(60); // Dynamic thumb width
const isDraggingThumb = ref(false);
const scrollOffset = ref(0);
const currentWorldX = ref(0); // Track absolute world position
const isDraggingTimeline = ref(false);
const dragStartX = ref(0);
const dragStartY = ref(0);
const dragStartWorldX = ref(0);
const dragStartWorldY = ref(0);
const hasDragged = ref(false);
let resizeObserver: ResizeObserver | null = null;

// Watch scroll offset and update main container position
watch(scrollOffset, (newOffset) => {
  if (scrollableContentContainer.value && timeline.value && app.value) {
    const canvasWidth = app.value.screen.width;
    const scrollbarWidth = canvasWidth - channelListWidth;
    const maxScroll = Math.max(0, TIMELINE_WIDTH.value - scrollbarWidth);
    const worldX = maxScroll > 0 ? newOffset * maxScroll : 0;
    // Apply horizontal scroll to scrollable content and timeline
    scrollableContentContainer.value.x = channelListWidth - worldX;
    timeline.value.x = channelListWidth - worldX;
    currentWorldX.value = worldX; // Store current world position
  }
});

// Watch vertical scroll offset and update container Y position
watch(verticalScrollOffset, (newOffset) => {
  if (scrollableContentContainer.value && app.value && channelListScrollableContainer.value) {
    const canvasHeight = app.value.screen.height;
    const availableHeight = canvasHeight - addChannelButtonHeight;
    const totalContentHeight = channels.value.length * rowHeight;
    const maxScrollY = Math.max(0, totalContentHeight - availableHeight);
    const worldY = maxScrollY > 0 ? newOffset * maxScrollY : 0;

    // Apply vertical scroll only to scrollable content
    scrollableContentContainer.value.y = addChannelButtonHeight - worldY;
    currentWorldY.value = worldY;

    // Also scroll the channel list scrollable container
    channelListScrollableContainer.value.y = addChannelButtonHeight - worldY;
  }
}); const containerHeight = computed(() => {
  const spriteCount = channels.value.length;
  return timelineHeight + (spriteCount * rowHeight);
});

onMounted(async () => {
  if (!pixiContainer.value) return;

  app.value = new Application();
  await app.value.init({
    width: pixiContainer.value.clientWidth || 800,
    height: pixiContainer.value.clientHeight || 600,
    backgroundColor: 0x000000,
    antialias: true,
    resolution: window.devicePixelRatio || 1
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
  scrollableContentContainer.value.x = channelListWidth;
  scrollableContentContainer.value.y = addChannelButtonHeight;
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

  // Create scrollbar
  createScrollbar();

  // Create vertical scrollbar
  createVerticalScrollbar();

  // Create timeline (add before channel list so it's below)
  createTimeline();

  // Create zoom buttons
  createZoomButtons();

  // Create channel list container (add after timeline so it's on top)
  channelListContainer.value = new Container();
  uiLayer.value.addChild(channelListContainer.value as any);

  // Create scrollable container for channel list rows
  channelListScrollableContainer.value = new Container();
  channelListScrollableContainer.value.y = addChannelButtonHeight;
  channelListContainer.value.addChild(channelListScrollableContainer.value as any);

  // Create channel list UI
  createChannelList();

  // Use ResizeObserver to watch for container size changes
  resizeObserver = new ResizeObserver((entries) => {
    // Use requestAnimationFrame to ensure layout is complete
    requestAnimationFrame(() => {
      if (entries && entries.length > 0) {
        const entry = entries[0];
        const width = entry?.contentRect.width;
        const height = entry?.contentRect.height;

        if ((width && height) && width > 0 && height > 0) {
          handleResize();
        }
      }
    });
  });

  if (pixiContainer.value) {
    resizeObserver.observe(pixiContainer.value);
  }

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
    context: true
  });
  app.value = null;
  channels.value = [];
  mainContainer.value = null;
  scrollableContentContainer.value = null;
  uiLayer.value = null;
  channelListContainer.value = null;
  channelListScrollableContainer.value = null;
  scrollBar.value = null;
  scrollThumb.value = null;
  timeline.value = null;
  verticalScrollBar.value = null;
  verticalScrollThumb.value = null;
  channelRowContainers.value.clear();
});

function createScrollbar() {
  if (!app.value || !uiLayer.value) return;

  const canvasWidth = app.value.screen.width;
  const canvasHeight = app.value.screen.height;
  const scrollbarWidth = canvasWidth - channelListWidth;

  // Scrollbar background (horizontal at top, offset by channel list width)
  scrollBar.value = new Graphics()
    .rect(channelListWidth, 0, scrollbarWidth, scrollBarHeight)
    .fill(0x333333);

  // Scrollbar thumb (horizontal)
  scrollThumb.value = new Graphics()
    .rect(0, 0, scrollThumbWidth.value, scrollBarHeight)
    .fill(0x888888);

  scrollThumb.value.x = channelListWidth;
  scrollThumb.value.y = 0;
  scrollThumb.value.eventMode = 'static';
  scrollThumb.value.cursor = 'pointer';

  // Add hover effect
  scrollThumb.value.on('pointerover', () => {
    if (scrollThumb.value) {
      const currentX = scrollThumb.value.x;
      const currentY = scrollThumb.value.y;
      scrollThumb.value.clear()
        .rect(0, 0, scrollThumbWidth.value, scrollBarHeight)
        .fill(0xaaaaaa);
      scrollThumb.value.x = currentX;
      scrollThumb.value.y = currentY;
    }
  });

  scrollThumb.value.on('pointerout', () => {
    if (scrollThumb.value && !isDraggingThumb.value) {
      const currentX = scrollThumb.value.x;
      const currentY = scrollThumb.value.y;
      scrollThumb.value.clear()
        .rect(0, 0, scrollThumbWidth.value, scrollBarHeight)
        .fill(0x888888);
      scrollThumb.value.x = currentX;
      scrollThumb.value.y = currentY;
    }
  });

  // Drag functionality
  scrollThumb.value.on('pointerdown', (event) => {
    isDraggingThumb.value = true;
    if (app.value) {
      app.value.stage.eventMode = 'static';
    }
    event.stopPropagation();
  });

  if (app.value.stage) {
    app.value.stage.on('pointerup', () => {
      if (isDraggingThumb.value) {
        isDraggingThumb.value = false;
        if (scrollThumb.value) {
          const currentX = scrollThumb.value.x;
          const currentY = scrollThumb.value.y;
          scrollThumb.value.clear()
            .rect(0, 0, scrollThumbWidth.value, scrollBarHeight)
            .fill(0x888888);
          scrollThumb.value.x = currentX;
          scrollThumb.value.y = currentY;
        }
      }
    });

    app.value.stage.on('pointermove', (event) => {
      if (isDraggingThumb.value && scrollThumb.value && app.value) {
        const canvasWidth = app.value.screen.width;
        const scrollbarWidth = canvasWidth - channelListWidth;
        const localX = event.global.x - channelListWidth;
        const newX = Math.max(channelListWidth, Math.min(event.global.x, channelListWidth + scrollbarWidth - scrollThumbWidth.value));
        scrollThumb.value.x = newX;

        // Calculate scroll offset
        const scrollPercentage = localX / (scrollbarWidth - scrollThumbWidth.value);
        scrollOffset.value = Math.max(0, Math.min(scrollPercentage, 1));
      }
    });

    // Global pointer up to catch mouse release anywhere
    app.value.stage.on('pointerupoutside', () => {
      if (isDraggingThumb.value) {
        isDraggingThumb.value = false;
        if (scrollThumb.value) {
          const currentX = scrollThumb.value.x;
          const currentY = scrollThumb.value.y;
          scrollThumb.value.clear()
            .rect(0, 0, scrollThumbWidth.value, scrollBarHeight)
            .fill(0x888888);
          scrollThumb.value.x = currentX;
          scrollThumb.value.y = currentY;
        }
      }
    });
  }

  uiLayer.value.addChild(scrollBar.value as any);
  uiLayer.value.addChild(scrollThumb.value as any);
}

function createVerticalScrollbar() {
  if (!app.value || !uiLayer.value) return;

  const canvasWidth = app.value.screen.width;
  const canvasHeight = app.value.screen.height;
  const scrollbarHeight = canvasHeight - addChannelButtonHeight;

  // Vertical scrollbar background (on the right side)
  verticalScrollBar.value = new Graphics()
    .rect(canvasWidth - verticalScrollBarWidth, addChannelButtonHeight, verticalScrollBarWidth, scrollbarHeight)
    .fill(0x333333);

  // Vertical scrollbar thumb
  verticalScrollThumb.value = new Graphics()
    .rect(0, 0, verticalScrollBarWidth, verticalScrollThumbHeight.value)
    .fill(0x888888);

  verticalScrollThumb.value.x = canvasWidth - verticalScrollBarWidth;
  verticalScrollThumb.value.y = addChannelButtonHeight;
  verticalScrollThumb.value.eventMode = 'static';
  verticalScrollThumb.value.cursor = 'pointer';

  // Add hover effect
  verticalScrollThumb.value.on('pointerover', () => {
    if (verticalScrollThumb.value) {
      const currentX = verticalScrollThumb.value.x;
      const currentY = verticalScrollThumb.value.y;
      verticalScrollThumb.value.clear()
        .rect(0, 0, verticalScrollBarWidth, verticalScrollThumbHeight.value)
        .fill(0xaaaaaa);
      verticalScrollThumb.value.x = currentX;
      verticalScrollThumb.value.y = currentY;
    }
  });

  verticalScrollThumb.value.on('pointerout', () => {
    if (verticalScrollThumb.value && !isDraggingVerticalThumb.value) {
      const currentX = verticalScrollThumb.value.x;
      const currentY = verticalScrollThumb.value.y;
      verticalScrollThumb.value.clear()
        .rect(0, 0, verticalScrollBarWidth, verticalScrollThumbHeight.value)
        .fill(0x888888);
      verticalScrollThumb.value.x = currentX;
      verticalScrollThumb.value.y = currentY;
    }
  });

  // Drag functionality
  verticalScrollThumb.value.on('pointerdown', (event) => {
    isDraggingVerticalThumb.value = true;
    if (app.value) {
      app.value.stage.eventMode = 'static';
    }
    event.stopPropagation();
  });

  if (app.value.stage) {
    app.value.stage.on('pointerup', () => {
      if (isDraggingVerticalThumb.value) {
        isDraggingVerticalThumb.value = false;
        if (verticalScrollThumb.value) {
          const currentX = verticalScrollThumb.value.x;
          const currentY = verticalScrollThumb.value.y;
          verticalScrollThumb.value.clear()
            .rect(0, 0, verticalScrollBarWidth, verticalScrollThumbHeight.value)
            .fill(0x888888);
          verticalScrollThumb.value.x = currentX;
          verticalScrollThumb.value.y = currentY;
        }
      }
    });

    app.value.stage.on('pointermove', (event) => {
      if (isDraggingVerticalThumb.value && verticalScrollThumb.value && app.value) {
        const canvasHeight = app.value.screen.height;
        const scrollbarHeight = canvasHeight - addChannelButtonHeight;
        const newY = Math.max(addChannelButtonHeight, Math.min(event.global.y, addChannelButtonHeight + scrollbarHeight - verticalScrollThumbHeight.value));
        verticalScrollThumb.value.y = newY;

        // Calculate scroll offset based on thumb position within scrollbar
        const thumbPositionInScrollbar = newY - addChannelButtonHeight;
        const scrollPercentage = thumbPositionInScrollbar / (scrollbarHeight - verticalScrollThumbHeight.value);
        verticalScrollOffset.value = Math.max(0, Math.min(scrollPercentage, 1));
      }
    });

    app.value.stage.on('pointerupoutside', () => {
      if (isDraggingVerticalThumb.value) {
        isDraggingVerticalThumb.value = false;
        if (verticalScrollThumb.value) {
          const currentX = verticalScrollThumb.value.x;
          const currentY = verticalScrollThumb.value.y;
          verticalScrollThumb.value.clear()
            .rect(0, 0, verticalScrollBarWidth, verticalScrollThumbHeight.value)
            .fill(0x888888);
          verticalScrollThumb.value.x = currentX;
          verticalScrollThumb.value.y = currentY;
        }
      }
    });
  }

  uiLayer.value.addChild(verticalScrollBar.value as any);
  uiLayer.value.addChild(verticalScrollThumb.value as any);
}

function createTimeline() {
  if (!app.value || !uiLayer.value) return;

  timeline.value = new Container();
  timeline.value.x = channelListWidth; // Start after channel list
  timeline.value.y = scrollBarHeight; // Position below the scrollbar

  const graphics = new Graphics();

  // Determine major tick interval based on zoom level
  let majorTickInterval: number;
  let minorTickInterval: number;
  let pixelsPerMajorTick: number;

  switch (zoomLevel.value) {
    case 0: // 5 seconds per major tick
      majorTickInterval = 5;
      minorTickInterval = 1;
      pixelsPerMajorTick = 10 * PIXELS_PER_SECOND; // 300 pixels
      break;
    case 1: // 15 seconds per major tick
      majorTickInterval = 15;
      minorTickInterval = 3;
      pixelsPerMajorTick = 10 * PIXELS_PER_SECOND; // 300 pixels
      break;
    case 2: // 30 seconds per major tick
      majorTickInterval = 30;
      minorTickInterval = 5;
      pixelsPerMajorTick = 10 * PIXELS_PER_SECOND; // 300 pixels
      break;
    case 3: // 45 seconds per major tick
      majorTickInterval = 45;
      minorTickInterval = 5;
      pixelsPerMajorTick = 10 * PIXELS_PER_SECOND; // 300 pixels
      break;
    case 4: // 1 minute per major tick
      majorTickInterval = 60;
      minorTickInterval = 10;
      pixelsPerMajorTick = 10 * PIXELS_PER_SECOND; // 300 pixels
      break;
    case 5: // 1:15 per major tick
      majorTickInterval = 75;
      minorTickInterval = 15;
      pixelsPerMajorTick = 10 * PIXELS_PER_SECOND; // 300 pixels
      break;
    case 6: // 1:30 per major tick
      majorTickInterval = 90;
      minorTickInterval = 15;
      pixelsPerMajorTick = 10 * PIXELS_PER_SECOND; // 300 pixels
      break;
    case 7: // 1:45 per major tick
      majorTickInterval = 105;
      minorTickInterval = 15;
      pixelsPerMajorTick = 10 * PIXELS_PER_SECOND; // 300 pixels
      break;
    case 8: // 2:00 per major tick
      majorTickInterval = 120;
      minorTickInterval = 20;
      pixelsPerMajorTick = 10 * PIXELS_PER_SECOND; // 300 pixels
      break;
    default:
      majorTickInterval = 5;
      minorTickInterval = 1;
      pixelsPerMajorTick = 10 * PIXELS_PER_SECOND;
  }

  // Draw the timeline background
  graphics
    .rect(0, 0, TIMELINE_WIDTH.value, timelineHeight)
    .fill(0x1a1a1a);

  // Calculate how many major ticks fit in the timeline
  const numMajorTicks = Math.floor(TIMELINE_DURATION_SECONDS / majorTickInterval);

  // Draw tick marks with consistent pixel spacing
  for (let tickIndex = 0; tickIndex <= numMajorTicks; tickIndex++) {
    const x = tickIndex * pixelsPerMajorTick;

    // Major tick
    graphics
      .rect(x, timelineHeight - 20, 2, 20)
      .fill(0xffffff);

    // Draw minor ticks between major ticks
    if (tickIndex < numMajorTicks) {
      const minorTicksPerMajor = majorTickInterval / minorTickInterval;
      for (let minorIndex = 1; minorIndex < minorTicksPerMajor; minorIndex++) {
        const minorX = x + (minorIndex * pixelsPerMajorTick / minorTicksPerMajor);
        graphics
          .rect(minorX, timelineHeight - 10, 1, 10)
          .fill(0x888888);
      }
    }
  }

  timeline.value.addChild(graphics);

  // Add time labels at major ticks (after graphics so they're on top)
  for (let tickIndex = 1; tickIndex <= numMajorTicks; tickIndex++) {
    const x = tickIndex * pixelsPerMajorTick;
    const second = tickIndex * majorTickInterval;
    const minutes = Math.floor(second / 60);
    const seconds = second % 60;
    const timeString = `${minutes}:${seconds.toString().padStart(2, '0')}`;

    const timeLabel = new HTMLText({
      text: timeString,
      style: {
        fontFamily: 'Arial, sans-serif',
        fontSize: '12px',
        fill: '#ffffff'
      }
    });

    // Wait for next frame to get accurate width for centering
    requestAnimationFrame(() => {
      if (timeLabel.width > 0) {
        timeLabel.x = x - (timeLabel.width / 2);
      }
    });

    timeLabel.x = x - 15; // Approximate centering
    timeLabel.y = 2;
    timeline.value.addChild(timeLabel);
  }

  uiLayer.value.addChild(timeline.value as any);
}

function createZoomButtons() {
  if (!app.value || !uiLayer.value) return;

  const canvasWidth = app.value.screen.width;
  const buttonRadius = 15;
  const buttonSpacing = 8;
  const rightMargin = verticalScrollBarWidth + 10;
  const topMargin = scrollBarHeight + 10;

  // Plus button
  plusButton.value = new Container();
  plusButton.value.x = canvasWidth - rightMargin - buttonRadius * 4 - buttonSpacing;
  plusButton.value.y = topMargin;
  plusButton.value.eventMode = 'static';
  plusButton.value.cursor = 'pointer';

  const plusCircle = new Graphics()
    .circle(buttonRadius, buttonRadius, buttonRadius)
    .fill(0x4a90e2);

  plusButton.value.addChild(plusCircle);

  // Plus symbol
  const plusSymbol = new Graphics()
    .rect(buttonRadius - 6, buttonRadius - 1.5, 12, 3)
    .fill(0xffffff)
    .rect(buttonRadius - 1.5, buttonRadius - 6, 3, 12)
    .fill(0xffffff);

  plusButton.value.addChild(plusSymbol);

  // Plus button hover effect
  plusButton.value.on('pointerover', () => {
    plusCircle.clear()
      .circle(buttonRadius, buttonRadius, buttonRadius)
      .fill(0x5aa0f2);
  });

  plusButton.value.on('pointerout', () => {
    plusCircle.clear()
      .circle(buttonRadius, buttonRadius, buttonRadius)
      .fill(0x4a90e2);
  });

  plusButton.value.on('pointertap', () => {
    zoomIn();
  });

  uiLayer.value.addChild(plusButton.value as any);

  // Minus button
  minusButton.value = new Container();
  minusButton.value.x = canvasWidth - rightMargin - buttonRadius * 2;
  minusButton.value.y = topMargin;
  minusButton.value.eventMode = 'static';
  minusButton.value.cursor = 'pointer';

  const minusCircle = new Graphics()
    .circle(buttonRadius, buttonRadius, buttonRadius)
    .fill(0x4a90e2);

  minusButton.value.addChild(minusCircle);

  // Minus symbol
  const minusSymbol = new Graphics()
    .rect(buttonRadius - 6, buttonRadius - 1.5, 12, 3)
    .fill(0xffffff);

  minusButton.value.addChild(minusSymbol);

  // Minus button hover effect
  minusButton.value.on('pointerover', () => {
    minusCircle.clear()
      .circle(buttonRadius, buttonRadius, buttonRadius)
      .fill(0x5aa0f2);
  });

  minusButton.value.on('pointerout', () => {
    minusCircle.clear()
      .circle(buttonRadius, buttonRadius, buttonRadius)
      .fill(0x4a90e2);
  });

  minusButton.value.on('pointertap', () => {
    zoomOut();
  });

  uiLayer.value.addChild(minusButton.value as any);
}

function zoomOut() {
  // Don't zoom out if already at maximum zoom out level
  if (zoomLevel.value >= 8) return;

  // Cycle through zoom levels
  zoomLevel.value = zoomLevel.value + 1;

  // Calculate scale factor based on zoom level
  // Keep the pixel spacing between major ticks constant, but change what time they represent
  let scaleMultiplier: number;
  switch (zoomLevel.value) {
    case 0: // 5 seconds per major tick
      scaleMultiplier = 0.5;
      break;
    case 1: // 15 seconds per major tick
      scaleMultiplier = 1.5;
      break;
    case 2: // 30 seconds per major tick
      scaleMultiplier = 3;
      break;
    case 3: // 45 seconds per major tick
      scaleMultiplier = 4.5;
      break;
    case 4: // 1 minute per major tick
      scaleMultiplier = 6;
      break;
    case 5: // 1:15 per major tick
      scaleMultiplier = 7.5;
      break;
    case 6: // 1:30 per major tick
      scaleMultiplier = 9;
      break;
    case 7: // 1:45 per major tick
      scaleMultiplier = 10.5;
      break;
    case 8: // 2:00 per major tick
      scaleMultiplier = 12;
      break;
    default:
      scaleMultiplier = 0.5;
  }

  // Update timeline width based on scale
  // Original width divided by scale factor (zooming out makes timeline shorter)
  const oldTimelineWidth = TIMELINE_WIDTH.value;
  TIMELINE_WIDTH.value = (PIXELS_PER_SECOND * TIMELINE_DURATION_SECONDS) / scaleMultiplier;

  // Calculate the focus point before zoom based on scroll position
  if (app.value) {
    const canvasWidth = app.value.screen.width;
    const scrollbarWidth = canvasWidth - channelListWidth;

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
      if (scrollProgress > 0.95) {
        // Focus on a point near the right edge of viewport
        focusPointX = scrollbarWidth * 0.8;
      }
      // If at the beginning (<5%), keep the beginning visible
      else if (scrollProgress < 0.05) {
        // Focus on a point near the left edge of viewport
        focusPointX = scrollbarWidth * 0.2;
      }
      // Otherwise, use a weighted focus point
      else {
        // Blend between center and edges based on scroll progress
        // scrollProgress 0.5 (middle) -> use center
        // scrollProgress > 0.5 (toward end) -> bias right
        // scrollProgress < 0.5 (toward start) -> bias left
        const centerWeight = 1 - Math.abs(scrollProgress - 0.5) * 2; // 1 at middle, 0 at edges
        const edgeBias = scrollProgress > 0.5
          ? (scrollProgress - 0.5) * 2  // 0 to 1 as we move toward end
          : -(0.5 - scrollProgress) * 2; // -1 to 0 as we move toward start

        focusPointX = scrollbarWidth * (0.5 + edgeBias * 0.3 * (1 - centerWeight));
      }
    }

    // Calculate the time at the focus point
    const focusTimeInSeconds = ((currentWorldX.value + focusPointX) / oldTimelineWidth) * TIMELINE_DURATION_SECONDS;

    // Calculate where that time should be in the new timeline
    const newFocusPositionX = (focusTimeInSeconds / TIMELINE_DURATION_SECONDS) * TIMELINE_WIDTH.value;

    // Calculate new scroll position to keep the focus time at the focus point
    const newWorldX = newFocusPositionX - focusPointX;
    const newMaxScroll = Math.max(0, TIMELINE_WIDTH.value - scrollbarWidth);

    if (newMaxScroll > 0) {
      // If we were at the beginning before (<5%), snap to the beginning after zoom
      if (oldMaxScroll > 0 && currentWorldX.value / oldMaxScroll < 0.05) {
        currentWorldX.value = 0;
        scrollOffset.value = 0;
      }
      // If we were at the end before (>95%), snap to the end after zoom
      else if (oldMaxScroll > 0 && currentWorldX.value / oldMaxScroll > 0.95) {
        currentWorldX.value = newMaxScroll;
        scrollOffset.value = 1;
      } else {
        currentWorldX.value = Math.max(0, Math.min(newWorldX, newMaxScroll));
        scrollOffset.value = currentWorldX.value / newMaxScroll;
      }
    } else {
      currentWorldX.value = 0;
      scrollOffset.value = 0;
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
  updateScrollbar();

  // Update the timeline and scrollable content positions based on new scroll values
  if (scrollableContentContainer.value && timeline.value && app.value) {
    const canvasWidth = app.value.screen.width;
    const scrollbarWidth = canvasWidth - channelListWidth;
    const maxScroll = Math.max(0, TIMELINE_WIDTH.value - scrollbarWidth);
    const worldX = maxScroll > 0 ? scrollOffset.value * maxScroll : 0;
    scrollableContentContainer.value.x = channelListWidth - worldX;
    timeline.value.x = channelListWidth - worldX;
    currentWorldX.value = worldX;
  }

  // Update all event box positions based on new timeline width
  updateAllEventBoxPositions();

  // Update all row backgrounds based on new timeline width
  updateAllRowBackgrounds();
}

function zoomIn() {
  // Don't zoom in if already at maximum zoom in level
  if (zoomLevel.value <= 0) return;

  // Cycle through zoom levels
  zoomLevel.value = zoomLevel.value - 1;

  // Calculate scale factor based on zoom level
  let scaleMultiplier: number;
  switch (zoomLevel.value) {
    case 0: // 5 seconds per major tick
      scaleMultiplier = 0.5;
      break;
    case 1: // 15 seconds per major tick
      scaleMultiplier = 1.5;
      break;
    case 2: // 30 seconds per major tick
      scaleMultiplier = 3;
      break;
    case 3: // 45 seconds per major tick
      scaleMultiplier = 4.5;
      break;
    case 4: // 1 minute per major tick
      scaleMultiplier = 6;
      break;
    case 5: // 1:15 per major tick
      scaleMultiplier = 7.5;
      break;
    case 6: // 1:30 per major tick
      scaleMultiplier = 9;
      break;
    case 7: // 1:45 per major tick
      scaleMultiplier = 10.5;
      break;
    case 8: // 2:00 per major tick
      scaleMultiplier = 12;
      break;
    default:
      scaleMultiplier = 0.5;
  }

  // Update timeline width based on scale
  const oldTimelineWidth = TIMELINE_WIDTH.value;
  TIMELINE_WIDTH.value = (PIXELS_PER_SECOND * TIMELINE_DURATION_SECONDS) / scaleMultiplier;

  // Calculate the focus point before zoom based on scroll position
  if (app.value) {
    const canvasWidth = app.value.screen.width;
    const scrollbarWidth = canvasWidth - channelListWidth;

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
      if (scrollProgress > 0.95) {
        // Focus on a point near the right edge of viewport
        focusPointX = scrollbarWidth * 0.8;
      }
      // If at the beginning (<5%), keep the beginning visible
      else if (scrollProgress < 0.05) {
        // Focus on a point near the left edge of viewport
        focusPointX = scrollbarWidth * 0.2;
      }
      // Otherwise, use a weighted focus point
      else {
        // Blend between center and edges based on scroll progress
        // scrollProgress 0.5 (middle) -> use center
        // scrollProgress > 0.5 (toward end) -> bias right
        // scrollProgress < 0.5 (toward start) -> bias left
        const centerWeight = 1 - Math.abs(scrollProgress - 0.5) * 2; // 1 at middle, 0 at edges
        const edgeBias = scrollProgress > 0.5
          ? (scrollProgress - 0.5) * 2  // 0 to 1 as we move toward end
          : -(0.5 - scrollProgress) * 2; // -1 to 0 as we move toward start

        focusPointX = scrollbarWidth * (0.5 + edgeBias * 0.3 * (1 - centerWeight));
      }
    }

    // Calculate the time at the focus point
    const focusTimeInSeconds = ((currentWorldX.value + focusPointX) / oldTimelineWidth) * TIMELINE_DURATION_SECONDS;

    // Calculate where that time should be in the new timeline
    const newFocusPositionX = (focusTimeInSeconds / TIMELINE_DURATION_SECONDS) * TIMELINE_WIDTH.value;

    // Calculate new scroll position to keep the focus time at the focus point
    const newWorldX = newFocusPositionX - focusPointX;
    const newMaxScroll = Math.max(0, TIMELINE_WIDTH.value - scrollbarWidth);

    if (newMaxScroll > 0) {
      // If we were at the beginning before (<5%), snap to the beginning after zoom
      if (oldMaxScroll > 0 && currentWorldX.value / oldMaxScroll < 0.05) {
        currentWorldX.value = 0;
        scrollOffset.value = 0;
      }
      // If we were at the end before (>95%), snap to the end after zoom
      else if (oldMaxScroll > 0 && currentWorldX.value / oldMaxScroll > 0.95) {
        currentWorldX.value = newMaxScroll;
        scrollOffset.value = 1;
      } else {
        currentWorldX.value = Math.max(0, Math.min(newWorldX, newMaxScroll));
        scrollOffset.value = currentWorldX.value / newMaxScroll;
      }
    } else {
      currentWorldX.value = 0;
      scrollOffset.value = 0;
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
  updateScrollbar();

  // Update the timeline and scrollable content positions based on new scroll values
  if (scrollableContentContainer.value && timeline.value && app.value) {
    const canvasWidth = app.value.screen.width;
    const scrollbarWidth = canvasWidth - channelListWidth;
    const maxScroll = Math.max(0, TIMELINE_WIDTH.value - scrollbarWidth);
    const worldX = maxScroll > 0 ? scrollOffset.value * maxScroll : 0;
    scrollableContentContainer.value.x = channelListWidth - worldX;
    timeline.value.x = channelListWidth - worldX;
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
  const background = new Graphics()
    .rect(0, 0, channelListWidth, canvasHeight)
    .fill(0x2a2a2a);
  channelListContainer.value.addChild(background);

  // Re-add the scrollable container (after background)
  channelListScrollableContainer.value = new Container();
  channelListScrollableContainer.value.y = addChannelButtonHeight;
  channelListContainer.value.addChild(channelListScrollableContainer.value as any);

  // Create "Add Channel" button at the top (fixed position)
  const buttonHeight = addChannelButtonHeight;
  const buttonContainer = new Container();
  buttonContainer.eventMode = 'static';
  buttonContainer.cursor = 'pointer';

  const button = new Graphics()
    .rect(0, 0, channelListWidth, buttonHeight)
    .fill(0x4a90e2);

  buttonContainer.addChild(button);

  // Add hover effect
  buttonContainer.on('pointerover', () => {
    button.clear()
      .rect(0, 0, channelListWidth, buttonHeight)
      .fill(0x5aa0f2);
  });

  buttonContainer.on('pointerout', () => {
    button.clear()
      .rect(0, 0, channelListWidth, buttonHeight)
      .fill(0x4a90e2);
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
      fontWeight: 'bold'
    }
  });

  // Center the text
  requestAnimationFrame(() => {
    if (buttonText.width > 0 && buttonText.height > 0) {
      buttonText.x = (channelListWidth - buttonText.width) / 2;
      buttonText.y = (buttonHeight - buttonText.height) / 2;
    }
  });

  buttonText.x = channelListWidth / 2 - 40;
  buttonText.y = buttonHeight / 2 - 8;

  buttonContainer.addChild(buttonText);
  buttonContainer.zIndex = 10; // Ensure it's on top
  channelListContainer.value.addChild(buttonContainer);

  // Draw channel rows in scrollable container
  channels.value.forEach((channel, index) => {
    const yPos = index * rowHeight;

    // Create container for the row
    const rowContainer = new Container();
    rowContainer.y = yPos;

    // Alternating background colors
    const rowColor = index % 2 === 0 ? 0xe5e5e5 : 0xf5f5f5;
    const row = new Graphics()
      .rect(0, 0, channelListWidth, rowHeight)
      .fill(rowColor);

    // Add border
    row
      .rect(0, rowHeight - 1, channelListWidth, 1)
      .fill(0xcccccc);

    rowContainer.addChild(row);

    const rowText = new HTMLText({
      text: `Row ${index + 1}`,
      style: {
        fontFamily: 'Arial, sans-serif',
        fontSize: '14px',
        fill: '#000000'
      }
    });

    rowText.x = 16;
    rowText.y = (rowHeight / 2) - 7;

    rowContainer.addChild(rowText);
    channelListScrollableContainer.value!.addChild(rowContainer);
  });
}

function handleGlobalMouseMove(event: MouseEvent) {
  if (isDraggingTimeline.value && app.value && pixiContainer.value) {
    const rect = pixiContainer.value.getBoundingClientRect();
    const currentX = event.clientX - rect.left;
    const currentY = event.clientY - rect.top;

    const deltaX = dragStartX.value - currentX;
    const deltaY = dragStartY.value - currentY;

    // Mark as dragged if moved more than 3 pixels
    if (Math.abs(deltaX) > 3 || Math.abs(deltaY) > 3) {
      hasDragged.value = true;
    }

    // Update horizontal scroll
    const canvasWidth = app.value.screen.width;
    const scrollbarWidth = canvasWidth - channelListWidth;
    const maxScrollX = Math.max(0, TIMELINE_WIDTH.value - scrollbarWidth);

    if (maxScrollX > 0) {
      const newWorldX = Math.max(0, Math.min(dragStartWorldX.value + deltaX, maxScrollX));
      currentWorldX.value = newWorldX;
      scrollOffset.value = newWorldX / maxScrollX;
    }

    // Update vertical scroll
    const canvasHeight = app.value.screen.height;
    const availableHeight = canvasHeight - addChannelButtonHeight;
    const totalContentHeight = channels.value.length * rowHeight;
    const maxScrollY = Math.max(0, totalContentHeight - availableHeight);

    if (maxScrollY > 0) {
      const newWorldY = Math.max(0, Math.min(dragStartWorldY.value + deltaY, maxScrollY));
      currentWorldY.value = newWorldY;
      verticalScrollOffset.value = newWorldY / maxScrollY;

      // Update vertical thumb position
      if (verticalScrollThumb.value) {
        const scrollbarHeight = canvasHeight - addChannelButtonHeight;
        const thumbPositionInScrollbar = verticalScrollOffset.value * (scrollbarHeight - verticalScrollThumbHeight.value);
        const newThumbY = addChannelButtonHeight + thumbPositionInScrollbar;

        verticalScrollThumb.value.clear()
          .rect(0, 0, verticalScrollBarWidth, verticalScrollThumbHeight.value)
          .fill(0x888888);
        verticalScrollThumb.value.x = canvasWidth - verticalScrollBarWidth;
        verticalScrollThumb.value.y = newThumbY;
      }
    }
  }

  if (isDraggingThumb.value && scrollThumb.value && app.value && pixiContainer.value) {
    const rect = pixiContainer.value.getBoundingClientRect();
    const canvasX = event.clientX - rect.left;
    const canvasWidth = app.value.screen.width;
    const scrollbarWidth = canvasWidth - channelListWidth;
    const localX = canvasX - channelListWidth;
    const newX = Math.max(channelListWidth, Math.min(canvasX, channelListWidth + scrollbarWidth - scrollThumbWidth.value));
    scrollThumb.value.x = newX;

    // Calculate scroll offset
    const scrollPercentage = localX / (scrollbarWidth - scrollThumbWidth.value);
    scrollOffset.value = Math.max(0, Math.min(scrollPercentage, 1));
  }

  if (isDraggingVerticalThumb.value && verticalScrollThumb.value && app.value && pixiContainer.value) {
    const rect = pixiContainer.value.getBoundingClientRect();
    const canvasY = event.clientY - rect.top;
    const canvasHeight = app.value.screen.height;
    const scrollbarHeight = canvasHeight - addChannelButtonHeight;
    const newY = Math.max(addChannelButtonHeight, Math.min(canvasY, addChannelButtonHeight + scrollbarHeight - verticalScrollThumbHeight.value));
    verticalScrollThumb.value.y = newY;

    // Calculate scroll offset based on thumb position within scrollbar
    const thumbPositionInScrollbar = newY - addChannelButtonHeight;
    const scrollPercentage = thumbPositionInScrollbar / (scrollbarHeight - verticalScrollThumbHeight.value);
    verticalScrollOffset.value = Math.max(0, Math.min(scrollPercentage, 1));
  }
}

function handleGlobalMouseUp() {
  if (isDraggingTimeline.value) {
    isDraggingTimeline.value = false;
  }

  if (isDraggingThumb.value) {
    isDraggingThumb.value = false;
    if (scrollThumb.value) {
      const currentX = scrollThumb.value.x;
      const currentY = scrollThumb.value.y;
      scrollThumb.value.clear()
        .rect(0, 0, scrollThumbWidth.value, scrollBarHeight)
        .fill(0x888888);
      scrollThumb.value.x = currentX;
      scrollThumb.value.y = currentY;
    }
  }

  if (isDraggingVerticalThumb.value) {
    isDraggingVerticalThumb.value = false;
    if (verticalScrollThumb.value) {
      const currentX = verticalScrollThumb.value.x;
      const currentY = verticalScrollThumb.value.y;
      verticalScrollThumb.value.clear()
        .rect(0, 0, verticalScrollBarWidth, verticalScrollThumbHeight.value)
        .fill(0x888888);
      verticalScrollThumb.value.x = currentX;
      verticalScrollThumb.value.y = currentY;
    }
  }
}

function handleWheel(event: WheelEvent) {
  event.preventDefault();

  // Check if mouse is over timeline specifically (right of channel list, in the timeline height area)
  const isOverTimeline = !event.ctrlKey && pixiContainer.value
    && event.offsetX >= channelListWidth
    && event.offsetY >= scrollBarHeight
    && event.offsetY < addChannelButtonHeight;

  // Check if Ctrl key is held OR mouse is over timeline - if so, zoom instead of scroll
  if (event.ctrlKey || isOverTimeline) {
    // Accumulate scroll delta
    if (event.deltaY < 0) {
      zoomScrollAccumulator.value--;
    } else if (event.deltaY > 0) {
      zoomScrollAccumulator.value++;
    }

    // Check if we've accumulated 3 scroll events
    if (zoomScrollAccumulator.value <= -3) {
      // Scroll up = zoom in
      zoomIn();
      zoomScrollAccumulator.value = 0;
    } else if (zoomScrollAccumulator.value >= 3) {
      // Scroll down = zoom out
      zoomOut();
      zoomScrollAccumulator.value = 0;
    }
    return;
  }

  if (!app.value || !verticalScrollThumb.value) return;

  const canvasHeight = app.value.screen.height;
  const availableHeight = canvasHeight - addChannelButtonHeight;
  const totalContentHeight = channels.value.length * rowHeight;
  const maxScrollY = Math.max(0, totalContentHeight - availableHeight);

  // Only scroll if there's content to scroll
  if (maxScrollY <= 0) return;

  // Adjust scroll speed (pixels per wheel delta)
  const scrollSpeed = 0.5;
  const scrollDelta = event.deltaY * scrollSpeed;

  // Calculate new world Y position
  const newWorldY = Math.max(0, Math.min(currentWorldY.value + scrollDelta, maxScrollY));
  currentWorldY.value = newWorldY;

  // Update scroll offset
  verticalScrollOffset.value = newWorldY / maxScrollY;

  // Update thumb position
  const scrollbarHeight = canvasHeight - addChannelButtonHeight;
  const thumbPositionInScrollbar = verticalScrollOffset.value * (scrollbarHeight - verticalScrollThumbHeight.value);
  const newThumbY = addChannelButtonHeight + thumbPositionInScrollbar;

  const currentX = verticalScrollThumb.value.x;
  verticalScrollThumb.value.clear()
    .rect(0, 0, verticalScrollBarWidth, verticalScrollThumbHeight.value)
    .fill(0x888888);
  verticalScrollThumb.value.x = currentX;
  verticalScrollThumb.value.y = newThumbY;
}


function updateScrollbar() {
  if (!app.value || !scrollBar.value || !scrollThumb.value) return;

  const canvasWidth = app.value.screen.width;
  const scrollbarWidth = canvasWidth - channelListWidth;

  // Update scrollbar background to span width minus channel list
  scrollBar.value.clear()
    .rect(channelListWidth, 0, scrollbarWidth, scrollBarHeight)
    .fill(0x333333);

  // Keep scroll percentage consistent, but clamp thumb position
  const scrollPercentage = scrollOffset.value;
  const maxThumbX = scrollbarWidth - scrollThumbWidth.value;
  const newThumbX = Math.max(channelListWidth, Math.min(channelListWidth + (scrollPercentage * maxThumbX), channelListWidth + maxThumbX));

  // Update thumb with current width
  if (scrollThumb.value) {
    scrollThumb.value.clear()
      .rect(0, 0, scrollThumbWidth.value, scrollBarHeight)
      .fill(0x888888);
    scrollThumb.value.x = newThumbX;
    scrollThumb.value.y = 0;
  }
}

function handleResize() {
  if (!app.value || !pixiContainer.value || !scrollBar.value || !scrollThumb.value) return;

  // Force a reflow to get accurate dimensions
  const containerWidth = pixiContainer.value.getBoundingClientRect().width;
  const containerHeight = pixiContainer.value.getBoundingClientRect().height;

  // Resize the canvas using getBoundingClientRect for accuracy
  app.value.renderer.resize(
    Math.floor(containerWidth) || 800,
    Math.floor(containerHeight) || 600
  );

  const newCanvasWidth = app.value.screen.width;
  const scrollbarWidth = newCanvasWidth - channelListWidth;

  // Update the thumb width based on new scrollbar size
  const viewportRatio = scrollbarWidth / TIMELINE_WIDTH.value;
  const newThumbWidth = Math.max(minScrollThumbWidth, scrollbarWidth * viewportRatio);

  scrollThumbWidth.value = newThumbWidth;

  // Calculate new scroll offset based on the stored world position
  const newMaxScroll = Math.max(0, TIMELINE_WIDTH.value - scrollbarWidth);

  // If the viewport is now larger than or equal to the timeline, reset to start
  if (newMaxScroll <= 0) {
    scrollOffset.value = 0;
    currentWorldX.value = 0;
  } else {
    // Clamp the world position to not exceed the new maximum scroll
    const clampedWorldX = Math.min(currentWorldX.value, newMaxScroll);
    currentWorldX.value = clampedWorldX; // Update this FIRST
    scrollOffset.value = clampedWorldX / newMaxScroll;
    // Manually update the container position since watch might not trigger if scrollOffset doesn't change
    if (scrollableContentContainer.value) {
      scrollableContentContainer.value.x = channelListWidth - clampedWorldX;
    }
    if (timeline.value) {
      timeline.value.x = channelListWidth - clampedWorldX;
    }
  }

  // Update scrollbar graphics to match new dimensions
  updateScrollbar();

  // Update vertical scrollbar graphics to match new dimensions
  updateVerticalScrollbar();

  // Update zoom button positions
  updateZoomButtonPositions();

  // Update channel list graphics to match new dimensions
  createChannelList();
}

function updateZoomButtonPositions() {
  if (!app.value || !plusButton.value || !minusButton.value) return;

  const canvasWidth = app.value.screen.width;
  const buttonRadius = 15;
  const buttonSpacing = 8;
  const rightMargin = verticalScrollBarWidth + 10;
  const topMargin = scrollBarHeight + 10;

  plusButton.value.x = canvasWidth - rightMargin - buttonRadius * 4 - buttonSpacing;
  plusButton.value.y = topMargin;

  minusButton.value.x = canvasWidth - rightMargin - buttonRadius * 2;
  minusButton.value.y = topMargin;
}

function updateVerticalScrollbar() {
  if (!app.value || !verticalScrollBar.value || !verticalScrollThumb.value) return;

  const canvasWidth = app.value.screen.width;
  const canvasHeight = app.value.screen.height;
  const scrollbarHeight = canvasHeight - addChannelButtonHeight;
  const totalContentHeight = channels.value.length * rowHeight;
  const availableHeight = scrollbarHeight;

  // Update scrollbar background
  verticalScrollBar.value.clear()
    .rect(canvasWidth - verticalScrollBarWidth, addChannelButtonHeight, verticalScrollBarWidth, scrollbarHeight)
    .fill(0x333333);

  // Calculate thumb height based on content ratio
  const viewportRatio = availableHeight / totalContentHeight;
  const newThumbHeight = Math.max(minVerticalScrollThumbHeight, scrollbarHeight * viewportRatio);
  verticalScrollThumbHeight.value = newThumbHeight;

  // Calculate new scroll offset based on stored world position
  const newMaxScrollY = Math.max(0, totalContentHeight - availableHeight);

  if (newMaxScrollY <= 0) {
    verticalScrollOffset.value = 0;
    currentWorldY.value = 0;
  } else {
    const clampedWorldY = Math.min(currentWorldY.value, newMaxScrollY);
    currentWorldY.value = clampedWorldY;
    verticalScrollOffset.value = clampedWorldY / newMaxScrollY;

    // Manually update container positions
    if (scrollableContentContainer.value) {
      scrollableContentContainer.value.y = addChannelButtonHeight - clampedWorldY;
    }
    if (channelListScrollableContainer.value) {
      channelListScrollableContainer.value.y = addChannelButtonHeight - clampedWorldY;
    }
  }  // Keep scroll percentage consistent, but clamp thumb position
  const scrollPercentage = verticalScrollOffset.value;
  const maxThumbY = scrollbarHeight - verticalScrollThumbHeight.value;
  const newThumbY = Math.max(addChannelButtonHeight, Math.min(addChannelButtonHeight + (scrollPercentage * maxThumbY), addChannelButtonHeight + maxThumbY));

  // Update thumb with current height
  if (verticalScrollThumb.value) {
    verticalScrollThumb.value.clear()
      .rect(0, 0, verticalScrollBarWidth, verticalScrollThumbHeight.value)
      .fill(0x888888);
    verticalScrollThumb.value.x = canvasWidth - verticalScrollBarWidth;
    verticalScrollThumb.value.y = newThumbY;
  }
}

function createChannelRowContainer(channelId: number, rowIndex: number) {
  if (!scrollableContentContainer.value || !app.value) return;

  // Create a container for this channel row
  const rowContainer = new Container();
  rowContainer.x = 0; // Aligned with timeline
  rowContainer.y = (rowIndex * rowHeight);
  rowContainer.eventMode = 'static';
  rowContainer.cursor = 'pointer';

  // Draw the row background
  const rowBg = new Graphics();
  const rowColor = rowIndex % 2 === 0 ? 0x2a2a2a : 0x1a1a1a;
  rowBg
    .rect(0, 0, TIMELINE_WIDTH.value, rowHeight)
    .fill(rowColor);

  // Add border
  rowBg
    .rect(0, rowHeight - 1, TIMELINE_WIDTH.value, 1)
    .fill(0x444444);

  rowContainer.addChild(rowBg);

  // Add click handler to create red box at click position
  rowContainer.on('pointertap', (event) => {
    // Only create box with left mouse button
    if (event.button !== 0) return;

    // Don't create box if user was dragging
    if (hasDragged.value) return;

    if (!scrollableContentContainer.value || !app.value) return;

    // Get the local position within the row container
    const localPos = rowContainer.toLocal(event.global);

    // Calculate the time in seconds based on pixel position
    const timeInSeconds = (localPos.x / TIMELINE_WIDTH.value) * TIMELINE_DURATION_SECONDS;

    // Create and store the event box
    addEventBox(rowContainer, channelId, timeInSeconds);
  });

  scrollableContentContainer.value.addChild(rowContainer as any);

  // Store the container in the map
  channelRowContainers.value.set(channelId, rowContainer);

  // Update positions of any existing event boxes for this channel
  updateEventBoxPositions(channelId);
} function addEventBox(rowContainer: Container, channelId: number, timeInSeconds: number) {
  const boxWidth = 60;
  const boxHeight = rowHeight - 10;
  const boxY = 5;

  // Calculate pixel position from time in seconds
  const pixelPosition = (timeInSeconds / TIMELINE_DURATION_SECONDS) * TIMELINE_WIDTH.value;

  const eventBox = new Graphics();
  eventBox
    .rect(0, 0, boxWidth, boxHeight)
    .fill(0xff0000);

  eventBox
    .rect(0, 0, boxWidth, boxHeight)
    .stroke({ width: 2, color: 0xaa0000 });

  // Position the box
  eventBox.x = pixelPosition;
  eventBox.y = boxY;

  rowContainer.addChild(eventBox);

  // Store the event data with graphics reference
  if (!channelEventBoxes.value.has(channelId)) {
    channelEventBoxes.value.set(channelId, []);
  }
  channelEventBoxes.value.get(channelId)!.push({ channelId, timeInSeconds, graphics: eventBox });
}

function updateEventBoxPositions(channelId: number) {
  const events = channelEventBoxes.value.get(channelId) || [];

  // Update positions of all event boxes based on current timeline width
  events.forEach(event => {
    const pixelPosition = (event.timeInSeconds / TIMELINE_DURATION_SECONDS) * TIMELINE_WIDTH.value;
    event.graphics.x = pixelPosition;
  });
}

function updateAllEventBoxPositions() {
  // Update positions for all channels
  channelEventBoxes.value.forEach((events, channelId) => {
    updateEventBoxPositions(channelId);
  });
}

function updateAllRowBackgrounds() {
  // Update background width for all channel rows
  channelRowContainers.value.forEach((rowContainer, channelId) => {
    // The first child is the background graphics
    if (rowContainer.children.length > 0) {
      const rowBg = rowContainer.children[0] as Graphics;
      const rowIndex = Array.from(channelRowContainers.value.keys()).indexOf(channelId);
      const rowColor = rowIndex % 2 === 0 ? 0x2a2a2a : 0x1a1a1a;

      rowBg.clear();
      rowBg.rect(0, 0, TIMELINE_WIDTH.value, rowHeight).fill(rowColor);
      rowBg.rect(0, rowHeight - 1, TIMELINE_WIDTH.value, 1).fill(0x444444);
    }
  });
}

function addChannel() {
  const newChannel: Channel = {
    id: channels.value.length + 1,
    name: `Channel ${channels.value.length + 1}`,
    events: []
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
