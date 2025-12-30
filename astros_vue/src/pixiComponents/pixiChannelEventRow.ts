import { Container, Graphics } from "pixi.js";
import { type Ref } from "vue";

export interface PixiChannelEventRowOptions {
  channelId: string;
  rowIdx: number;
  height: number;
  rowColor?: number;
  borderColor?: number;
  timeLineDuration: number;
  timeLineWidth: Ref<number>;
  isDragging: Ref<boolean>;
  onClick: (id: string, time: number) => void;
}

export class PixiChannelEventRow extends Container {
  channelId: string;
  rowIdx: number;
  options: PixiChannelEventRowOptions;

  constructor(options: PixiChannelEventRowOptions) {
    super()
    this.options = options;
    this.channelId = options.channelId;
    this.rowIdx = options.rowIdx;
    this.x = 0;
    this.y = options.rowIdx * options.height;
    this.eventMode = "static";
    this.cursor = "pointer";

    const background = new Graphics();
    background.rect(0, 0, options.timeLineWidth.value, options.height)
      .fill(this.getRowColor());

    // Add bottom border line
    background.rect(0, options.height - 1, options.timeLineWidth.value, 1)
      .fill(this.getBorderColor());
    this.addChild(background);

    this.on('pointertap', (event) => {
      // Only respond to left-click
      if (event.button !== 0) return;

      // Don't create box if user was dragging timeline or event box
      /*if (hasDragged.value || hasEventBoxDragged.value) {
        hasEventBoxDragged.value = false; // Reset flag
        return;
      }*/
      if (this.options.isDragging.value) {
        return;
      }

      const localPos = this.toLocal(event.global);

      const time = Math.floor((localPos.x / this.options.timeLineWidth.value) * this.options.timeLineDuration);

      this.options.onClick(this.channelId, time);
    });
  }

  getRowColor(): number {
    if (this.options.rowColor !== undefined) {
      return this.options.rowColor;
    }
    return this.rowIdx % 2 === 0 ? 0x2a2a2a : 0x1a1a1a;
  }

  getBorderColor(): number {
    if (this.options.borderColor !== undefined) {
      return this.options.borderColor;
    }
    return 0x444444;
  }
}