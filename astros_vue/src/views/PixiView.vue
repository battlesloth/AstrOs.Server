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
const scrollBar = ref<Graphics | null>(null);
const scrollThumb = ref<Graphics | null>(null);
const timeline = ref<Container | null>(null);

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
    const maxScroll = Math.max(0, TIMELINE_WIDTH - canvasWidth);
    const worldX = maxScroll > 0 ? newOffset * maxScroll : 0;
    mainContainer.value.x = -worldX;
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

  // Create scrollbar
  createScrollbar();

  // Create timeline
  createTimeline();

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
  scrollBar.value = null;
  scrollThumb.value = null;
  timeline.value = null;
});

function createScrollbar() {
  if (!app.value || !uiLayer.value) return;

  const canvasWidth = app.value.screen.width;
  const canvasHeight = app.value.screen.height;

  // Scrollbar background (horizontal at top)
  scrollBar.value = new Graphics()
    .rect(0, 0, canvasWidth, scrollBarHeight)
    .fill(0x333333);

  // Scrollbar thumb (horizontal)
  scrollThumb.value = new Graphics()
    .rect(0, 0, scrollThumbWidth.value, scrollBarHeight)
    .fill(0x888888);

  scrollThumb.value.x = 0;
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
        const newX = Math.max(0, Math.min(event.global.x, canvasWidth - scrollThumbWidth.value));
        scrollThumb.value.x = newX;

        // Calculate scroll offset
        const scrollPercentage = newX / (canvasWidth - scrollThumbWidth.value);
        scrollOffset.value = scrollPercentage;
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

function handleGlobalMouseMove(event: MouseEvent) {
  if (isDraggingThumb.value && scrollThumb.value && app.value && pixiContainer.value) {
    const rect = pixiContainer.value.getBoundingClientRect();
    const canvasX = event.clientX - rect.left;
    const canvasWidth = app.value.screen.width;
    const newX = Math.max(0, Math.min(canvasX, canvasWidth - scrollThumbWidth.value));
    scrollThumb.value.x = newX;

    // Calculate scroll offset
    const scrollPercentage = newX / (canvasWidth - scrollThumbWidth.value);
    scrollOffset.value = scrollPercentage;
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

  // Update scrollbar background to span full width
  scrollBar.value.clear()
    .rect(0, 0, canvasWidth, scrollBarHeight)
    .fill(0x333333);

  // Keep scroll percentage consistent, but clamp thumb position
  const scrollPercentage = scrollOffset.value;
  const maxThumbX = canvasWidth - scrollThumbWidth.value;
  const newThumbX = Math.max(0, Math.min(scrollPercentage * maxThumbX, maxThumbX));

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

  // Update the thumb width based on new canvas size
  const viewportRatio = newCanvasWidth / TIMELINE_WIDTH;
  const newThumbWidth = Math.max(minScrollThumbWidth, newCanvasWidth * viewportRatio);

  scrollThumbWidth.value = newThumbWidth;

  // Calculate new scroll offset based on the stored world position
  const newMaxScroll = Math.max(0, TIMELINE_WIDTH - newCanvasWidth);

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
      mainContainer.value.x = -clampedWorldX;
    }
  }

  // Update scrollbar graphics to match new dimensions
  updateScrollbar();
}

function addChannel() {
  const newChannel: Channel = {
    id: channels.value.length + 1,
    name: `Channel ${channels.value.length + 1}`,
    events: []
  };
  channels.value.push(newChannel);
}

</script>

<template>
  <AstrosLayout>
    <template v-slot:main>
      <div class="h-full w-full overflow-hidden">
        <div id="main-container" class="flex flex-col h-full w-full p-4">
          <div id="header" class="flex flex-row p-4 shrink-0">
            <p>Last channel clicked: {{ lastChannelClicked }}</p>
          </div>
          <div id="scripter"
            class="flex flex-row w-full flex-1 min-h-0 overflow-x-hidden overflow-y-scroll border border-gray-300">
            <div id="channels" class="flex flex-col w-64 border-r border-gray-300 shrink-0"
              :style="{ minHeight: containerHeight + 'px' }">
              <div id="add-channel" class="sticky top-0 bg-base-100 z-10 border-b border-gray-300 shrink-0"
                :style="{ height: addChannelButtonHeight + 'px', minHeight: addChannelButtonHeight + 'px', maxHeight: addChannelButtonHeight + 'px' }">
                <button @click="addChannel" class="btn btn-primary w-full rounded-none h-full min-h-full">Add
                  Channel</button>
              </div>
              <div class="flex flex-col pt-0">
                <ul class="list-none p-0 m-0">
                  <li v-for="(channel, index) in channels" :key="index"
                    :class="index % 2 === 0 ? 'bg-gray-200' : 'bg-gray-100'"
                    class="flex items-center px-4 border-b border-gray-300"
                    :style="{ height: rowHeight + 'px', minHeight: rowHeight + 'px', maxHeight: rowHeight + 'px' }">
                    <span class="text-sm">Row {{ index + 1 }}</span>
                  </li>
                </ul>
              </div>
            </div>
            <div id="timeline" class="flex flex-col flex-1 min-w-0">
              <div ref="pixiContainer" class="flex-1 bg-black" :style="{ minHeight: containerHeight + 'px' }"></div>
            </div>
          </div>
        </div>
      </div>
    </template>
  </AstrosLayout>
</template>
