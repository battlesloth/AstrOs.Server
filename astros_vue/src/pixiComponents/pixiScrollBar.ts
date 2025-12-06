import { Graphics } from "pixi.js";
import type { PixiScrollBarOptions } from "./pixiScrollBarOptions";
import { ScrollBarDirection } from "./pixiScrollBarOptions";
import { PixiScrollBarThumb } from "./pixiScrollBarThumb";

export class PixiScrollBar extends Graphics {
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

    private scrollThumb: PixiScrollBarThumb | null = null;

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

        this.rect(this.xOffset, this.yOffset, this.barWidth, this.barHeight)
            .fill(this.fillColor);

        this.scrollThumb = new PixiScrollBarThumb(
            this.direction === ScrollBarDirection.HORIZONTAL ? this.thumbSize : this.barWidth,
            this.direction === ScrollBarDirection.VERTICAL ? this.thumbSize : this.barHeight,
            this.xOffset,
            this.yOffset,
            this.onThumbDragStart,
            this.thumbFillColor,
            this.thumbFocusColor
        );

        this.addChild(this.scrollThumb);
    }

    public resize(newBarSize: number, newThumbSize: number, scrollOffset: number) {
        this.barWidth = newBarSize;
        this.clear()
            .rect(this.xOffset, this.yOffset, this.barWidth, this.barHeight)
            .fill(this.fillColor);

        const scrollPercentage = scrollOffset;

        if (this.direction === ScrollBarDirection.VERTICAL) {
            const maxThumbY = this.barHeight - this.thumbSize;
            const newThumbY = Math.max(
                this.yOffset,
                Math.min(this.yOffset + scrollPercentage * maxThumbY, this.yOffset + maxThumbY),
            );

            this.scrollThumb?.resizeY(newThumbSize, newThumbY);
        } else {
            const maxThumbX = this.barWidth - this.thumbSize;
            const newThumbX = Math.max(
                this.xOffset,
                Math.min(this.xOffset + scrollPercentage * maxThumbX, this.xOffset + maxThumbX),
            );

            this.scrollThumb?.resizeX(newThumbSize, newThumbX);
        }
    }

    public setDragging(dragging: boolean) {
        this.scrollThumb?.setDragging(dragging);
    }

    public drag(eventPos: number): number {

        if (!this.scrollThumb?.isDragging()) return 0;

        if (this.direction === ScrollBarDirection.VERTICAL) {
            const localY = eventPos - this.yOffset;
            const newY = Math.max(
                this.yOffset,
                Math.min(eventPos, this.yOffset + this.barHeight - this.thumbSize),
            );
            this.scrollThumb?.dragY(newY);

            return this.scrollToPercentage(localY, this.barHeight);
        }
        else {
            const localX = eventPos - this.xOffset;
            const newX = Math.max(
                this.xOffset,
                Math.min(eventPos, this.xOffset + this.barWidth - this.thumbSize),
            );

            this.scrollThumb?.dragX(newX);

            return this.scrollToPercentage(localX, this.barWidth);
        }
    }

    public endDrag() {
        this.scrollThumb?.endDrag();
    }

    private scrollToPercentage(localVal: number, barSize: number): number {
        const scrollPercentage = localVal / (barSize - this.thumbSize);
        return Math.max(0, Math.min(scrollPercentage, 1));
    }
}