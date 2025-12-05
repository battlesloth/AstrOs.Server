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
const uiLayer = ref<Container | null>(null);
const channelListContainer = ref<Container | null>(null);
const scrollBar = ref<Graphics | null>(null);
const scrollThumb = ref<Graphics | null>(null);
const timeline = ref<Container | null>(null);

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
  if (mainContainer.value && app.value) {
    const canvasWidth = app.value.screen.width;
    const scrollbarWidth = canvasWidth - channelListWidth;
    const maxScroll = Math.max(0, TIMELINE_WIDTH - scrollbarWidth);
    const worldX = maxScroll > 0 ? newOffset * maxScroll : 0;
    // Offset mainContainer to account for channel list, then apply scroll
    mainContainer.value.x = channelListWidth - worldX;
    currentWorldX.value = worldX; // Store current world position
  }
});

const containerHeight = computed(() => {
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

  // Create UI layer (always on top)
  uiLayer.value = new Container();
  app.value.stage.addChild(uiLayer.value as any);

  // Create channel list container
  channelListContainer.value = new Container();
  uiLayer.value.addChild(channelListContainer.value as any);

  // Create scrollbar
  createScrollbar();

  // Create timeline
  createTimeline();

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
});

onUnmounted(() => {
  if (resizeObserver) {
    resizeObserver.disconnect();
    resizeObserver = null;
  }
  window.removeEventListener('mousemove', handleGlobalMouseMove);
  window.removeEventListener('mouseup', handleGlobalMouseUp);

  app.value?.destroy(true, {
    children: true,
    texture: true,
    textureSource: true,
    context: true
  });
  app.value = null;
  channels.value = [];
  mainContainer.value = null;
  uiLayer.value = null;
  channelListContainer.value = null;
  scrollBar.value = null;
  scrollThumb.value = null;
  timeline.value = null;
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

function createTimeline() {
  if (!app.value || !mainContainer.value) return;

  timeline.value = new Container();
  timeline.value.x = 0; // No offset needed - mainContainer handles positioning
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

  mainContainer.value.addChild(timeline.value as any);
}

function createChannelList() {
  if (!app.value || !channelListContainer.value) return;

  // Clear existing content
  channelListContainer.value.removeChildren();

  const canvasHeight = app.value.screen.height;

  // Create background for channel list area
  const background = new Graphics()
    .rect(0, 0, channelListWidth, canvasHeight)
    .fill(0x2a2a2a);
  channelListContainer.value.addChild(background);

  // Create "Add Channel" button at the top
  const buttonHeight = addChannelButtonHeight;
  const button = new Graphics()
    .rect(0, 0, channelListWidth, buttonHeight)
    .fill(0x4a90e2);

  button.eventMode = 'static';
  button.cursor = 'pointer';

  // Add hover effect
  button.on('pointerover', () => {
    button.clear()
      .rect(0, 0, channelListWidth, buttonHeight)
      .fill(0x5aa0f2);
  });

  button.on('pointerout', () => {
    button.clear()
      .rect(0, 0, channelListWidth, buttonHeight)
      .fill(0x4a90e2);
  });

  button.on('pointertap', () => {
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

  button.addChild(buttonText);
  channelListContainer.value.addChild(button);

  // Draw channel rows
  channels.value.forEach((channel, index) => {
    const yPos = buttonHeight + (index * rowHeight);

    // Alternating background colors
    const rowColor = index % 2 === 0 ? 0xe5e5e5 : 0xf5f5f5;
    const row = new Graphics()
      .rect(0, yPos, channelListWidth, rowHeight)
      .fill(rowColor);

    // Add border
    row
      .rect(0, yPos + rowHeight - 1, channelListWidth, 1)
      .fill(0xcccccc);

    const rowText = new HTMLText({
      text: `Row ${index + 1}`,
      style: {
        fontFamily: 'Arial, sans-serif',
        fontSize: '14px',
        fill: '#000000'
      }
    });

    rowText.x = 16;
    rowText.y = yPos + (rowHeight / 2) - 7;

    row.addChild(rowText);
    channelListContainer.value!.addChild(row);
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
    if (mainContainer.value) {
      mainContainer.value.x = channelListWidth - clampedWorldX;
    }
  }

  // Update scrollbar graphics to match new dimensions
  updateScrollbar();

  // Update channel list graphics to match new dimensions
  createChannelList();
}

function addChannel() {
  const newChannel: Channel = {
    id: channels.value.length + 1,
    name: `Channel ${channels.value.length + 1}`,
    events: []
  };
  channels.value.push(newChannel);

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
