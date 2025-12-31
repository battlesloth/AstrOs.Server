import type { ScriptChannelType } from '@/enums/scripts/scriptChannelType';
import { Container, Graphics } from 'pixi.js';
import { type Ref } from 'vue';

export interface PixiChannelEventRowOptions {
  channelId: string;
  channelType: ScriptChannelType;
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
  channelType: ScriptChannelType;
  rowIdx: number;
  options: PixiChannelEventRowOptions;

  background: Graphics | null = null;

  constructor(options: PixiChannelEventRowOptions) {
    super();
    this.options = options;
    this.channelId = options.channelId;
    this.channelType = options.channelType;
    this.rowIdx = options.rowIdx;
    this.x = 0;
    this.y = this.rowIdx * options.height;
    this.eventMode = 'static';
    this.cursor = 'pointer';

    this.background = new Graphics();
    this.setBackground();
    this.addChild(this.background);

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

      const time = Math.floor(
        (localPos.x / this.options.timeLineWidth.value) * this.options.timeLineDuration,
      );

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

  updateIdx(newIdx: number) {
    this.rowIdx = newIdx;
    this.y = this.rowIdx * this.options.height;
    this.setBackground();
  }

  setBackground() {
    if (this.background) {
      // Get width from the ref - handle both ref and unwrapped cases
      let width: number | undefined;
      const timeLineWidth = this.options.timeLineWidth;

      if (timeLineWidth && typeof timeLineWidth === 'object' && 'value' in timeLineWidth) {
        // It's still a ref
        width = timeLineWidth.value;
      } else if (typeof timeLineWidth === 'number') {
        // It got unwrapped to a plain number
        width = timeLineWidth;
      }

      this.background.clear();
      this.background
        .rect(0, 0, width!, this.options.height)
        .fill(this.getRowColor());
      // Add bottom border line
      this.background
        .rect(0, this.options.height - 1, width!, 1)
        .fill(this.getBorderColor());
    }
  }
}
