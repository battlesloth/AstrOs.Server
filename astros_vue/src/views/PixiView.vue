<script setup lang="ts">
import AstrosLayout from '@/components/layout/AstrosLayout.vue'
import { Application, Assets, Container, Graphics, HTMLText, type ContainerChild } from 'pixi.js';
import { computed, markRaw, onMounted, onUnmounted, ref, watch } from 'vue';
import textureUrl from '../assets/lindwurm.png';

const app = ref<Application | null>(null);
const pixiContainer = ref<HTMLDivElement | null>(null);
const addedSprites = ref<any[]>([]);
const hitCount = ref(0);
const timelineHeight = 50;
const rowHeight = 60;
const timelineBar = ref<Container<ContainerChild>>(new Container());

const containerHeight = computed(() => {
  const spriteCount = addedSprites.value.length;
  return timelineHeight + (spriteCount * rowHeight);
});

onMounted(async () => {
  app.value = new Application();
  await app.value.init({
    width: 800,
    height: containerHeight.value,
    backgroundColor: 0x1099bb,
    autoDensity: true,
    resolution: window.devicePixelRatio || 1,
  });
  pixiContainer.value?.appendChild(app.value.canvas);

  const container = new Container();
  app.value.stage.addChild(container);
  app.value.stage.sortableChildren = true;
  await preloadTextures();

  // Create timeline bar
  createTimelineBar();

  // Add scroll listener to update timeline position
  const scrollContainer = pixiContainer.value?.parentElement;
  if (scrollContainer) {
    scrollContainer.addEventListener('scroll', updateTimelineBar);
  }

  // Add resize observer to handle width changes
  const resizeObserver = new ResizeObserver(() => {
    if (app.value && pixiContainer.value) {
      app.value.renderer.resize(
        pixiContainer.value.offsetWidth,
        containerHeight.value
      );
      updateTimelineBar();
    }
  });

  if (pixiContainer.value) {
    resizeObserver.observe(pixiContainer.value);
  }
})

watch(containerHeight, (newHeight) => {
  if (app.value && pixiContainer.value) {
    app.value.renderer.resize(pixiContainer.value.offsetWidth, newHeight);
    updateTimelineBar();
  }
});

onUnmounted(() => {
  app.value?.destroy(true, {
    children: true,
    texture: true,
    textureSource: true,
    context: true
  });
  app.value = null;
  addedSprites.value = [];
  hitCount.value = 0;
  timelineBar.value = null as unknown as Container;
});

async function preloadTextures() {
  await Assets.load(textureUrl);
}

function createTimelineBar() {
  if (!app.value) return;

  timelineBar.value = timelineBar.value || new Container();

  const background = new Graphics();
  background.rect(0, 0, app.value.renderer.width, timelineHeight);
  background.fill({ color: 0x2d3748 });

  timelineBar.value.addChild(background);

  // Add time markers
  createTimelineMarkers();

  timelineBar.value.zIndex = 1000;
  app.value.stage.addChild(timelineBar.value as Container<ContainerChild>);
}

function createTimelineMarkers() {
  if (!app.value || !timelineBar.value) return;

  // Remove old markers if they exist (keep the background)
  while (timelineBar.value.children.length > 1) {
    timelineBar.value.removeChildAt(1);
  }

  const totalSeconds = 60; // Show 60 seconds
  const pixelsPerSecond = app.value.renderer.width / totalSeconds;

  for (let i = 0; i <= totalSeconds; i += 5) {
    const x = i * pixelsPerSecond;

    // Draw tick mark
    const tick = new Graphics();
    tick.rect(x, 5, 1, 10);
    tick.fill({ color: 0xffffff });
    timelineBar.value.addChild(tick);

    // Draw second label
    const label = new HTMLText({
      text: `${i}s`,
      style: {
        fontSize: 12,
        fill: '#ffffff',
      }
    });
    label.x = x - (label.width / 2);
    label.y = 18;

    timelineBar.value.addChild(label);
  }
}

function updateTimelineBar() {
  if (!app.value || !timelineBar.value) return;

  const background = timelineBar.value.children[0] as Graphics;
  background.clear();
  background.rect(0, 0, app.value.renderer.width, timelineHeight);
  background.fill({ color: 0x2d3748 });

  // Recreate timeline markers for new width
  createTimelineMarkers();

  // Update row widths
  addedSprites.value.forEach((rowContainer) => {
    const rowBackground = rowContainer.children[0] as Graphics;
    rowBackground.clear();
    const index = addedSprites.value.indexOf(rowContainer);
    const color = index % 2 === 0 ? 0xe0e0e0 : 0xf5f5f5;
    rowBackground.rect(0, 0, app.value!.renderer.width, rowHeight);
    rowBackground.fill({ color });
  });

  // Update position based on scroll
  const scrollTop = pixiContainer.value?.parentElement?.scrollTop || 0;
  timelineBar.value.y = scrollTop;
}

function addSprite() {
  if (!app.value) {
    console.error('PIXI Application not initialized');
    return;
  };

  const index = addedSprites.value.length;
  const color = index % 2 === 0 ? 0xe0e0e0 : 0xf5f5f5;

  const rowContainer = markRaw(new Container());
  const yPosition = timelineHeight + (index * rowHeight);
  rowContainer.y = yPosition;

  const background = new Graphics();
  background.rect(0, 0, app.value.renderer.width, rowHeight);
  background.fill({ color });

  rowContainer.addChild(background);
  app.value.stage.addChild(rowContainer);
  addedSprites.value.push(rowContainer as any);
}
</script>

<template>
  <AstrosLayout>
    <template v-slot:main>
      <div class="h-full w-full overflow-hidden">
        <div id="main-container" class="flex flex-col h-full w-full p-4">
          <div id="header" class="flex flex-row p-4 shrink-0">
            <p>Click count: {{ hitCount }}</p>
          </div>
          <div id="scripter"
            class="flex flex-row w-full flex-1 min-h-0 overflow-x-hidden overflow-y-scroll border border-gray-300">
            <div id="channels" class="flex flex-col w-64 border-r border-gray-300 shrink-0"
              :style="{ minHeight: containerHeight + 'px' }">
              <div id="add-channel" class="sticky top-0 bg-base-100 z-10 border-b border-gray-300 shrink-0"
                style="height: 50px; min-height: 50px; max-height: 50px;">
                <button @click="addSprite" class="btn btn-primary w-full rounded-none"
                  style="height: 50px; min-height: 50px;">Add Sprite</button>
              </div>
              <div class="flex flex-col pt-0">
                <ul class="list-none p-0 m-0">
                  <li v-for="(sprite, index) in addedSprites" :key="index"
                    :class="index % 2 === 0 ? 'bg-gray-200' : 'bg-gray-100'"
                    class="flex items-center px-4 border-b border-gray-300"
                    :style="{ height: rowHeight + 'px', minHeight: rowHeight + 'px', maxHeight: rowHeight + 'px' }">
                    <span class="text-sm">Row {{ index + 1 }}</span>
                  </li>
                </ul>
              </div>
            </div>
            <div id="timeline" class="flex flex-col flex-1">
              <div ref="pixiContainer" class="flex-1 bg-black" :style="{ minHeight: containerHeight + 'px' }"></div>
            </div>
          </div>
        </div>
      </div>
    </template>
  </AstrosLayout>
</template>
