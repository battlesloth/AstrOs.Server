import { Container, Graphics } from 'pixi.js';
import type { PixiScrollBarOptions } from './pixiScrollBarOptions';
import { ScrollBarDirection } from './pixiScrollBarOptions';
import { PixiScrollBarThumb } from './pixiScrollBarThumb';

export class PixiScrollBar extends Container {
  barWidth: number;
  barHeight: number;
  xOffset: number;
  yOffset: number;
  fillColor: number;
  direction: ScrollBarDirection;

  thumbSize: number;
  thumbFillColor: number;
  thumbFocusColor: number;
  onThumbDragStart: () => void;

  private background: Graphics;
  private scrollThumb: PixiScrollBarThumb;

  constructor(options: PixiScrollBarOptions) {
    super();

    this.barWidth = options.barWidth;
    this.barHeight = options.barHeight;
    this.xOffset = options.xOffset;
    this.yOffset = options.yOffset;
    this.direction = options.direction;
    this.fillColor = options.fillColor || 0x333333;

    this.thumbSize = options.thumbSize;
    this.thumbFillColor = options.thumbFillColor ?? 0x888888;
    this.thumbFocusColor = options.thumbFocusColor ?? 0xcccccc;
    this.onThumbDragStart = options.onThumbDragStart;

    this.background = new Graphics();
    this.background
      .rect(this.xOffset, this.yOffset, this.barWidth, this.barHeight)
      .fill(this.fillColor);

    this.scrollThumb = new PixiScrollBarThumb(
      this.direction === ScrollBarDirection.HORIZONTAL ? this.thumbSize : this.barWidth,
      this.direction === ScrollBarDirection.VERTICAL ? this.thumbSize : this.barHeight,
      this.xOffset,
      this.yOffset,
      this.onThumbDragStart,
      this.thumbFillColor,
      this.thumbFocusColor,
    );

    this.addChild(this.background);
    this.addChild(this.scrollThumb);
  }

  public resize(
    newBarSize: number,
    newThumbSize: number,
    newPosition: number,
    scrollOffset: number,
  ) {
    this.thumbSize = newThumbSize;
    if (this.direction === ScrollBarDirection.VERTICAL) {
      this.barHeight = newBarSize;
      this.xOffset = newPosition;
    } else {
      this.barWidth = newBarSize;
      this.yOffset = newPosition;
    }

    this.background
      .clear()
      .rect(this.xOffset, this.yOffset, this.barWidth, this.barHeight)
      .fill(this.fillColor);

    if (this.direction === ScrollBarDirection.VERTICAL) {
      const maxThumbY = this.barHeight - this.thumbSize;
      const newThumbY = Math.max(
        this.yOffset,
        Math.min(this.yOffset + scrollOffset * maxThumbY, this.yOffset + maxThumbY),
      );

      this.scrollThumb?.resizeY(newThumbSize, newThumbY, this.xOffset);
    } else {
      const maxThumbX = this.barWidth - this.thumbSize;
      const newThumbX = Math.max(
        this.xOffset,
        Math.min(this.xOffset + scrollOffset * maxThumbX, this.xOffset + maxThumbX),
      );

      this.scrollThumb?.resizeX(newThumbSize, newThumbX, this.yOffset);
    }
  }

  public setDragging(dragging: boolean) {
    this.scrollThumb?.setDragging(dragging);
  }

  public isDragging(): boolean {
    return this.scrollThumb?.isDragging() || false;
  }

  public drag(eventPos: number): number {
    if (!this.scrollThumb?.isDragging()) return 0;

    if (this.direction === ScrollBarDirection.VERTICAL) {
      // Adjust for the drag offset to maintain click position within thumb
      const dragOffset = this.scrollThumb.getDragOffsetY();
      const adjustedPos = eventPos - dragOffset;

      const newY = Math.max(
        this.yOffset,
        Math.min(adjustedPos, this.yOffset + this.barHeight - this.thumbSize),
      );
      this.scrollThumb?.dragY(newY);

      const localY = newY - this.yOffset;
      return this.scrollToPercentage(localY, this.barHeight);
    } else {
      // Adjust for the drag offset to maintain click position within thumb
      const dragOffset = this.scrollThumb.getDragOffsetX();
      const adjustedPos = eventPos - dragOffset;

      const newX = Math.max(
        this.xOffset,
        Math.min(adjustedPos, this.xOffset + this.barWidth - this.thumbSize),
      );

      this.scrollThumb?.dragX(newX);

      const localX = newX - this.xOffset;
      return this.scrollToPercentage(localX, this.barWidth);
    }
  }

  public endDrag() {
    this.scrollThumb?.endDrag();
  }

  public updateThumbFromOffset(scrollOffset: number) {
    if (this.direction === ScrollBarDirection.VERTICAL) {
      const maxThumbY = this.barHeight - this.thumbSize;
      const newThumbY = Math.max(
        this.yOffset,
        Math.min(this.yOffset + scrollOffset * maxThumbY, this.yOffset + maxThumbY),
      );
      this.scrollThumb?.setPositionY(newThumbY);
    } else {
      const maxThumbX = this.barWidth - this.thumbSize;
      const newThumbX = Math.max(
        this.xOffset,
        Math.min(this.xOffset + scrollOffset * maxThumbX, this.xOffset + maxThumbX),
      );
      this.scrollThumb?.setPositionX(newThumbX);
    }
  }

  private scrollToPercentage(localVal: number, barSize: number): number {
    const scrollPercentage = localVal / (barSize - this.thumbSize);
    return Math.max(0, Math.min(scrollPercentage, 1));
  }
}
