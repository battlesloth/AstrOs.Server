import { Container, FillGradient, Graphics, TextStyle, Text } from 'pixi.js';
import { ZOOM_LEVELS, type ZoomLevelConfig } from '@/composables/useZoomState';

export interface PixiTimelineOptions {
  xOffset: number;
  yOffset: number;
  width: number;
  height: number;
  duration: number;
  zoomLevel: number;
  pixelsPerMajorTick: number;
}

export class PixiTimeline extends Container {
  options: PixiTimelineOptions;
  zoomLevel: number;

  constructor(options: PixiTimelineOptions) {
    super();
    this.options = options;
    this.zoomLevel = options.zoomLevel;
    this.y = options.yOffset;
    this.x = options.xOffset;
    const graphics = new Graphics();

    graphics.rect(0, 0, options.width, options.height).fill(0x1a1a1a);

    const zoom = ZOOM_LEVELS[this.zoomLevel]!;

    this.drawTimelineTicks(graphics, zoom);

    this.addChild(graphics);

    this.drawTimelineLabels(this, zoom);
  }

  drawTimelineTicks(graphics: Graphics, zoom: ZoomLevelConfig) {
    const numMajorTicks = Math.floor(this.options.duration / zoom.majorTickInterval);
    const ppMt = this.options.pixelsPerMajorTick;

    // Draw tick marks with consistent pixel spacing
    for (let tickIndex = 0; tickIndex <= numMajorTicks; tickIndex++) {
      const x = tickIndex * ppMt;

      // Major tick
      graphics.rect(x, this.options.height - 20, 2, 20).fill(0xffffff);

      // Draw minor ticks between this major tick and the next (or end of timeline)
      if (tickIndex < numMajorTicks) {
        const minorTicksPerMajor = zoom.majorTickInterval / zoom.minorTickInterval;
        for (let minorIndex = 1; minorIndex < minorTicksPerMajor; minorIndex++) {
          const minorX = x + (minorIndex * ppMt) / minorTicksPerMajor;
          graphics.rect(minorX, this.options.height - 10, 1, 10).fill(0x888888);
        }
      }
    }

    // Draw remaining minor ticks after the last major tick to fill timeline to 10 minutes
    const lastMajorTickTime = numMajorTicks * zoom.majorTickInterval;
    const remainingTime = this.options.duration - lastMajorTickTime;

    if (remainingTime > 0) {
      const lastMajorTickX = numMajorTicks * ppMt;
      const numRemainingMinorTicks = Math.floor(remainingTime / zoom.minorTickInterval);

      for (let minorIndex = 1; minorIndex <= numRemainingMinorTicks; minorIndex++) {
        const minorTime = minorIndex * zoom.minorTickInterval;
        const minorX = lastMajorTickX + (minorTime / zoom.majorTickInterval) * ppMt;

        // Only draw if within timeline bounds
        if (minorX <= this.options.width) {
          graphics.rect(minorX, this.options.height - 10, 1, 10).fill(0x888888);
        }
      }
    }
  }

  drawTimelineLabels(container: Container, zoom: ZoomLevelConfig) {
    const numMajorTicks = Math.floor(this.options.duration / zoom.majorTickInterval);

    // Add time labels at major ticks
    for (let tickIndex = 1; tickIndex <= numMajorTicks; tickIndex++) {
      const x = tickIndex * this.options.pixelsPerMajorTick;
      const second = tickIndex * zoom.majorTickInterval;
      const minutes = Math.floor(second / 60);
      const seconds = second % 60;
      const timeString = `${minutes}:${seconds.toString().padStart(2, '0')}`;

      const fill = new FillGradient(0, 0, 1, 1);
      fill.addColorStop(0, 0xffffff);
      fill.addColorStop(1, 0xffffff);

      const style = new TextStyle({
        fontFamily: 'Arial',
        fontSize: 20,
        fill: fill,
      });

      const timeLabel = new Text({
        text: timeString,
        style: style,
      });

      timeLabel.x = x - timeLabel.width / 2;
      timeLabel.y = this.options.height - 43;

      container.addChild(timeLabel);
    }
  }
}
