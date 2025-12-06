export enum ScrollBarDirection {
    HORIZONTAL,
    VERTICAL,
}

export interface PixiScrollBarOptions {
    barWidth: number;
    barHeight: number;
    xOffset: number;
    yOffset: number;
    direction: ScrollBarDirection;
    fillColor?: number;
    thumbSize: number;
    thumbFillColor?: number;
    thumbFocusColor?: number;
    onThumbDragStart: () => void;
}