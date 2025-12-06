import { Graphics } from "pixi.js";
import type { PixiScrollBarOptions } from "./pixiScrollBarOptions";
import { PixiScrollBarThumb } from "./pixiScrollBarThumb";

export class VerticalScrollBar extends Graphics {
    barWidth: number;
    barHeight: number;
    xOffset: number;
    yOffset: number;
    fillColor: number;

    thumbHeight: number;
    thumbFillColor: number;
    thumbFocusColor: number
    onThumbDragStart: () => void;

    private scrollThumb: PixiScrollBarThumb | null = null;

    constructor(options: PixiScrollBarOptions) {
        super();

        this.barWidth = options.barWidth;
        this.barHeight = options.barHeight;
        this.xOffset = options.xOffset;
        this.yOffset = options.yOffset;
        this.fillColor = options.fillColor ?? 0x333333;

        this.thumbHeight = options.thumbSize;
        this.thumbFillColor = options.thumbFillColor ?? 0x888888;
        this.thumbFocusColor = options.thumbFocusColor ?? 0xcccccc;
        this.onThumbDragStart = options.onThumbDragStart;

        this.rect(
            this.xOffset,
            this.yOffset,
            this.barWidth,
            this.barHeight
        ).fill(this.fillColor);

        this.scrollThumb = new PixiScrollBarThumb(
            this.barWidth,
            this.thumbHeight,
            this.xOffset,
            this.yOffset,
            this.onThumbDragStart,
            this.thumbFillColor,
            this.thumbFocusColor
        );
        this.addChild(this.scrollThumb);
    }

}