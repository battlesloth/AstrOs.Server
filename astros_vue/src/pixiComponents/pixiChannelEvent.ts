import type { ScriptEvent } from "@/models/scripts/scriptEvent";
import { Container, FederatedPointerEvent, Graphics } from "pixi.js";

export interface PixiChannelEventOptions {
  channelId: string;
  deciseconds: number;
  scriptEvent: ScriptEvent;
  rowHeight: number;
  timelineWidth: number;
  timelineDurationSeconds: number;
  eventColor?: number;
  borderColor?: number;
  textColor?: number;
  onPointerTap: (event: FederatedPointerEvent, scriptEvent: ScriptEvent) => void;
  onPointerDown: (event: FederatedPointerEvent, eventBox: PixiChannelEvent) => void;
}


export class PixiChannelEvent extends Container {
  channelId: string;
  deciseconds: number;
  scriptEvent: ScriptEvent;
  options: PixiChannelEventOptions;
  boxWidth: number;
  boxHeight: number;

  constructor(options: PixiChannelEventOptions) {
    super();
    this.channelId = options.channelId;
    this.deciseconds = options.deciseconds;
    this.scriptEvent = options.scriptEvent;
    this.options = options;

    this.boxHeight = options.rowHeight - 10;
    this.boxWidth = 60;
    this.pivot.set(this.boxWidth / 2, 0);

    const pixelPosition = (options.deciseconds / options.timelineDurationSeconds) * options.timelineWidth;
    this.x = pixelPosition;
    this.y = 5;

    this.eventMode = 'static';
    this.cursor = 'grab';

    const background = new Graphics();
    background.rect(0, 0, this.boxWidth, this.boxHeight);
    background.fill(this.getBackgroundColor());
    background.stroke({ width: 2, color: this.getBorderColor() });

    this.addChild(background);

    this.on('pointertap', (event: FederatedPointerEvent) => {
      options.onPointerTap?.(event, this.options.scriptEvent);
    });

    this.on('pointerdown', (event: FederatedPointerEvent) => {
      options.onPointerDown?.(event, this);
    });
  }

  getBackgroundColor() {
    return this.options.eventColor ?? 0xff0000;
  }


  getBorderColor() {
    return this.options.borderColor ?? 0xaa0000;
  }

  getTextColor() {
    return this.options.textColor ?? 0xffffff;
  }

}