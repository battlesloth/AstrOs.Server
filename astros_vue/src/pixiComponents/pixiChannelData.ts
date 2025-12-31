import {
  Assets,
  Container,
  FillGradient,
  Graphics,
  Sprite,
  Text,
  TextStyle,
  Texture,
} from 'pixi.js';
import { truncateText } from './helpers';

export interface PixiChannelDataOptions {
  channelId: string;
  channelName: string;
  rowIdx: number;
  height: number;
  width: number;
  rowColor?: number;
  borderColor?: number;
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
  rowIdx: number;
  options: PixiChannelDataOptions;

  background: Graphics | null = null;

  constructor(options: PixiChannelDataOptions) {
    super();
    this.channelId = options.channelId;
    this.channelName = options.channelName;
    this.rowIdx = options.rowIdx;
    this.y = this.rowIdx * options.height;
    this.options = options;

    this.background = new Graphics()
    this.setBackground();
    this.addChild(this.background);

    const fill = new FillGradient(0, 0, 1, 1);
    fill.addColorStop(0, 0x000000);
    fill.addColorStop(1, 0x000000);

    const style = new TextStyle({
      fontFamily: 'Arial',
      fontSize: 20,
      fill: fill,
    });

    const text = truncateText(this.channelName, style, options.width - 20);

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
    button.x = this.options.width - xOffset;
    button.y = this.options.height - this.buttonYoffset;
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

  getRowColor(): number {
    if (this.options.rowColor !== undefined) {
      return this.options.rowColor;
    }
    return this.rowIdx % 2 === 0 ? 0xe5e5e5 : 0xf5f5f5;
  }

  getBorderColor(): number {
    if (this.options.borderColor !== undefined) {
      return this.options.borderColor;
    }
    return 0xcccccc;
  }

  updateIdx(newIdx: number) {
    this.rowIdx = newIdx;
    this.y = this.rowIdx * this.options.height;
    this.setBackground();
  }

  setBackground() {
    if (this.background) {
      this.background.clear();
      this.background
        .rect(0, 0, this.options.width, this.options.height)
        .fill(this.getRowColor());
      // Add bottom border line
      this.background
        .rect(0, this.options.height - 1, this.options.width, 1)
        .fill(this.getBorderColor());
    }
  }
}
