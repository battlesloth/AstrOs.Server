<script setup lang="ts">
import AstrosLayout from '@/components/layout/AstrosLayout.vue'
import { Application, Container, Graphics, HTMLText } from 'pixi.js';
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';

interface Channel {
  id: number;
  name: string;
  events: any[];
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
const TIMELINE_WIDTH = PIXELS_PER_SECOND * TIMELINE_DURATION_SECONDS; // 18000 pixels

// Scrollbar state
const minScrollThumbWidth = 40; // Minimum thumb width
const scrollThumbWidth = ref(60); // Dynamic thumb width
const isDraggingThumb = ref(false);
const scrollOffset = ref(0);
const currentWorldX = ref(0); // Track absolute world position
let resizeObserver: ResizeObserver | null = null;

// Watch scroll offset and update main container position
watch(scrollOffset, (newOffset) => {
  if (scrollableContentContainer.value && timeline.value && app.value) {
    const canvasWidth = app.value.screen.width;
    const scrollbarWidth = canvasWidth - channelListWidth;
    const maxScroll = Math.max(0, TIMELINE_WIDTH - scrollbarWidth);
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

  // Draw the timeline background
  graphics
    .rect(0, 0, TIMELINE_WIDTH, timelineHeight)
    .fill(0x1a1a1a);

  // Draw tick marks
  for (let second = 0; second <= TIMELINE_DURATION_SECONDS; second++) {
    const x = second * PIXELS_PER_SECOND;

    // Every 10 seconds is a major tick, others are minor
    const isMajorTick = second % 10 === 0;
    const tickHeight = isMajorTick ? 20 : 10;
    const tickColor = isMajorTick ? 0xffffff : 0x888888;
    const tickWidth = isMajorTick ? 2 : 1;

    graphics
      .rect(x, timelineHeight - tickHeight, tickWidth, tickHeight)
      .fill(tickColor);
  }

  timeline.value.addChild(graphics);

  // Add time labels at major ticks (after graphics so they're on top)
  // Skip the last marker at 10:00 since it gets cut off
  for (let second = 10; second < TIMELINE_DURATION_SECONDS; second += 10) {
    const x = second * PIXELS_PER_SECOND;
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
    console.log('Plus button clicked');
    // TODO: Implement zoom in functionality
  });

  uiLayer.value.addChild(plusButton.value);

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
    console.log('Minus button clicked');
    // TODO: Implement zoom out functionality
  });

  uiLayer.value.addChild(minusButton.value);
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
  const viewportRatio = scrollbarWidth / TIMELINE_WIDTH;
  const newThumbWidth = Math.max(minScrollThumbWidth, scrollbarWidth * viewportRatio);

  scrollThumbWidth.value = newThumbWidth;

  // Calculate new scroll offset based on the stored world position
  const newMaxScroll = Math.max(0, TIMELINE_WIDTH - scrollbarWidth);

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
    .rect(0, 0, TIMELINE_WIDTH, rowHeight)
    .fill(rowColor);

  // Add border
  rowBg
    .rect(0, rowHeight - 1, TIMELINE_WIDTH, 1)
    .fill(0x444444);

  rowContainer.addChild(rowBg);

  // Add click handler to create red box at click position
  rowContainer.on('pointertap', (event) => {
    if (!scrollableContentContainer.value || !app.value) return;

    // Get the local position within the row container
    const localPos = rowContainer.toLocal(event.global);

    // The X position is already in the correct coordinate space (relative to row)
    const timePosition = localPos.x;

    // Create red box at this position
    addEventBox(rowContainer, timePosition);
  });

  scrollableContentContainer.value.addChild(rowContainer as any);

  // Store the container in the map
  channelRowContainers.value.set(channelId, rowContainer);
}

function addEventBox(rowContainer: Container, timePosition: number) {
  // Create a red box
  const boxWidth = 60; // Width in pixels
  const boxHeight = rowHeight - 10; // Height with some padding
  const boxY = 5; // Vertical padding

  const eventBox = new Graphics();
  eventBox
    .rect(timePosition, boxY, boxWidth, boxHeight)
    .fill(0xff0000); // Red color

  // Add border
  eventBox
    .rect(timePosition, boxY, boxWidth, boxHeight)
    .stroke({ width: 2, color: 0xaa0000 }); // Darker red border

  rowContainer.addChild(eventBox);
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
