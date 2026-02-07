import { Container, Graphics, HTMLText } from 'pixi.js';

/**
 * Draws the timeline background
 */
export function drawTimelineBackground(graphics: Graphics, width: number, height: number) {
  graphics.rect(0, 0, width, height).fill(0x1a1a1a);
}

/**
 * Draws timeline tick marks
 */
export function drawTimelineTicks(
  graphics: Graphics,
  majorTickInterval: number,
  minorTickInterval: number,
  timelineHeight: number,
  timelineWidth: number,
  timelineDurationSeconds: number,
  pixelsPerMajorTick: number,
) {
  const numMajorTicks = Math.floor(timelineDurationSeconds / majorTickInterval);

  // Draw tick marks with consistent pixel spacing
  for (let tickIndex = 0; tickIndex <= numMajorTicks; tickIndex++) {
    const x = tickIndex * pixelsPerMajorTick;

    // Major tick
    graphics.rect(x, timelineHeight - 20, 2, 20).fill(0xffffff);

    // Draw minor ticks between this major tick and the next (or end of timeline)
    if (tickIndex < numMajorTicks) {
      const minorTicksPerMajor = majorTickInterval / minorTickInterval;
      for (let minorIndex = 1; minorIndex < minorTicksPerMajor; minorIndex++) {
        const minorX = x + (minorIndex * pixelsPerMajorTick) / minorTicksPerMajor;
        graphics.rect(minorX, timelineHeight - 10, 1, 10).fill(0x888888);
      }
    }
  }

  // Draw remaining minor ticks after the last major tick to fill timeline to 10 minutes
  const lastMajorTickTime = numMajorTicks * majorTickInterval;
  const remainingTime = timelineDurationSeconds - lastMajorTickTime;

  if (remainingTime > 0) {
    const lastMajorTickX = numMajorTicks * pixelsPerMajorTick;
    const numRemainingMinorTicks = Math.floor(remainingTime / minorTickInterval);

    for (let minorIndex = 1; minorIndex <= numRemainingMinorTicks; minorIndex++) {
      const minorTime = minorIndex * minorTickInterval;
      const minorX = lastMajorTickX + (minorTime / majorTickInterval) * pixelsPerMajorTick;

      // Only draw if within timeline bounds
      if (minorX <= timelineWidth) {
        graphics.rect(minorX, timelineHeight - 10, 1, 10).fill(0x888888);
      }
    }
  }
}

/**
 * Draws timeline labels at major tick positions
 */
export function drawTimelineLabels(
  container: Container,
  majorTickInterval: number,
  timelineDurationSeconds: number,
  pixelsPerMajorTick: number,
  timelineHeight: number,
) {
  const numMajorTicks = Math.floor(timelineDurationSeconds / majorTickInterval);

  // Add time labels at major ticks
  for (let tickIndex = 1; tickIndex <= numMajorTicks; tickIndex++) {
    const x = tickIndex * pixelsPerMajorTick;
    const second = tickIndex * majorTickInterval;
    const minutes = Math.floor(second / 60);
    const seconds = second % 60;
    const timeString = `${minutes}:${seconds.toString().padStart(2, '0')}`;

    const timeLabel = new HTMLText({
      text: timeString,
      style: {
        fontSize: 12,
        fill: '#ffffff',
      },
    });

    timeLabel.x = x - timeLabel.width / 2;
    timeLabel.y = timelineHeight - 35;

    container.addChild(timeLabel);
  }
}
