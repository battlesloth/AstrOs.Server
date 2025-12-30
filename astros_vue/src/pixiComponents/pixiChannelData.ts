import {
  Assets,
  BitmapText,
  Container,
  FillGradient,
  Graphics,
  Sprite,
  Text,
  TextStyle,
  Texture,
} from 'pixi.js';
import { CHANNEL_LIST_WIDTH, ROW_HEIGHT } from '@/composables/timelineConstants';
import { truncateText } from './helpers';

export interface PixiChannelDataOptions {
  channelId: string;
  channelName: string;
  yOffset: number;
  rowColor: number;
  onSwap?: (id: string) => void;
  onTest?: (id: string) => void;
  onDelete?: (id: string, name: string) => void;
}

export interface PixiChannelSelectItem {
  val: number;
  item: string;
}

export class PixiChannelData extends Container {
  iconColor: number = 0x3a3a3a;
  iconScale: number = 0.12;
  buttonSize: number = 28;
  buttonXstart: number = 36;
  buttonXspacing: number = 6;
  buttonYoffset: number = 34;

  channelId: string;
  channelName: string;

  constructor(options: PixiChannelDataOptions) {
    super();
    this.channelId = options.channelId;
    this.channelName = options.channelName;
    this.y = options.yOffset;

    const background = new Graphics()
      .rect(0, 0, CHANNEL_LIST_WIDTH, ROW_HEIGHT)
      .fill(options.rowColor);

    // Add bottom border line
    background.rect(0, ROW_HEIGHT - 1, CHANNEL_LIST_WIDTH, 1).fill(0xcccccc);

    this.addChild(background);

    const fill = new FillGradient(0, 0, 1, 1);
    fill.addColorStop(0, 0x000000);
    fill.addColorStop(1, 0x000000);

    const style = new TextStyle({
      fontFamily: 'Arial',
      fontSize: 20,
      fill: fill,
    });

    const text = truncateText(this.channelName, style, CHANNEL_LIST_WIDTH - 20);

    const rowText = new Text({
      text: text,
      style: style,
    });

    rowText.x = 10;
    rowText.y = 10;
    this.addChild(rowText);

    let xOffset = this.buttonXstart;
    const deleteButton = this.createButton(xOffset, (id, name) => options.onDelete?.(id, name));
    xOffset += this.buttonSize + this.buttonXspacing;
    const testButton = this.createButton(xOffset, options.onTest);
    xOffset += this.buttonSize + this.buttonXspacing;
    const swapButton = this.createButton(xOffset, options.onSwap);

    Assets.load('swapIcon').then((texture) => {
      this.addIcon(swapButton, texture);
      this.addChild(swapButton);
    });

    Assets.load('deleteIcon').then((texture) => {
      this.addIcon(deleteButton, texture);
      this.addChild(deleteButton);
    });

    Assets.load('playIcon').then((texture) => {
      this.addIcon(testButton, texture);
      this.addChild(testButton);
    });
  }

  createButton(xOffset: number, callback?: (id: string, name: string) => void) {
    const button = new Container();
    button.x = CHANNEL_LIST_WIDTH - xOffset;
    button.y = ROW_HEIGHT - this.buttonYoffset;
    button.cursor = 'pointer';
    button.eventMode = 'static';

    if (callback) {
      button.on('pointerdown', () => {
        callback?.(this.channelId, this.channelName);
      });
    }

    const background = new Graphics()
      .roundRect(0, 0, this.buttonSize, this.buttonSize, 4)
      .fill(0xffffff)
      .stroke({ width: 1, color: 0xcccccc });

    button.addChild(background);

    return button;
  }

  addIcon(button: Container, texture: Texture) {
    const icon = new Sprite(texture);
    icon.anchor.set(0.5);
    icon.tint = this.iconColor;
    icon.scale.set(this.iconScale, this.iconScale);
    icon.x = this.buttonSize / 2;
    icon.y = this.buttonSize / 2;
    button.addChild(icon);
  }
}
