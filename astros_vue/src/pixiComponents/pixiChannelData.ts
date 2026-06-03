import { Assets, Container, Graphics, Sprite, Texture } from 'pixi.js';
import { getText, getTruncatedText } from './helpers';
import { ScriptChannelType } from '@/enums';

export interface PixiChannelDataOptions {
  channelId: string;
  channelName: string;
  channelType: ScriptChannelType;
  rowIdx: number;
  height: number;
  width: number;
  rowColor?: number;
  borderColor?: number;
  onSwap?: (id: string, type: ScriptChannelType) => void;
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
  channelType: ScriptChannelType;
  rowIdx: number;
  options: PixiChannelDataOptions;

  background: Graphics | null = null;
  nameText: Container | null = null;

  private isDestroyed = false;
  private buttons: Container[] = [];

  constructor(options: PixiChannelDataOptions) {
    super();
    this.channelId = options.channelId;
    this.channelName = options.channelName;
    this.channelType = options.channelType;
    this.rowIdx = options.rowIdx;
    this.y = this.rowIdx * options.height;
    this.options = options;

    this.background = new Graphics();

    this.setBackground();
    this.addChild(this.background);

    this.setNameText();

    const typeText = getText(this.getTypeName(this.channelType), 0x666666, 16);
    typeText.x = 10;
    typeText.y = options.height - 30;
    this.addChild(typeText);

    let xOffset = this.buttonXstart;
    const deleteButton = this.createButton(xOffset, (id, name) => options.onDelete?.(id, name));
    xOffset += this.buttonSize + this.buttonXspacing;
    const testButton = this.createButton(xOffset, (id) => options.onTest?.(id));
    xOffset += this.buttonSize + this.buttonXspacing;
    const swapButton = this.createButton(xOffset, (id) => options.onSwap?.(id, this.channelType));
    this.buttons.push(deleteButton, testButton, swapButton);

    this.loadIcon('swapIcon', swapButton);
    this.loadIcon('deleteIcon', deleteButton);
    this.loadIcon('playIcon', testButton);
  }

  /**
   * Loads a button icon asynchronously and attaches the button to the display
   * tree, but aborts if the container has been destroyed in the meantime.
   * Guards against `.then()` callbacks firing after unmount.
   */
  private loadIcon(asset: string, button: Container) {
    Assets.load(asset).then((texture) => {
      if (this.isDestroyed) return;
      this.addIcon(button, texture);
      this.addChild(button);
    });
  }

  updateChannel(name: string) {
    this.channelName = name;

    this.setNameText();
  }

  setNameText() {
    if (this.nameText) {
      this.removeChild(this.nameText);
    }

    this.nameText = new Container();
    this.nameText.x = 10;
    this.nameText.y = 10;

    const text = getTruncatedText(this.channelName, 0x000000, this.options.width - 20, 20);
    this.nameText.addChild(text);
    this.addChild(this.nameText);
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

  getTypeName(type: ScriptChannelType): string {
    switch (type) {
      case ScriptChannelType.NONE:
        return 'None';
      case ScriptChannelType.SERVO:
        return 'Servo';
      case ScriptChannelType.GPIO:
        return 'GPIO';
      case ScriptChannelType.AUDIO:
        return 'Audio';
      case ScriptChannelType.GENERIC_I2C:
        return 'I2C';
      case ScriptChannelType.GENERIC_UART:
        return 'Serial';
      case ScriptChannelType.KANGAROO:
        return 'KangarooX2';
      default:
        return 'Unknown';
    }
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
      this.background.rect(0, 0, this.options.width, this.options.height).fill(this.getRowColor());
      // Add bottom border line
      this.background
        .rect(0, this.options.height - 1, this.options.width, 1)
        .fill(this.getBorderColor());
    }
  }

  /**
   * Override of Pixi's Container.destroy so we can mark the instance as
   * destroyed (which short-circuits any in-flight Assets.load callbacks),
   * remove our own pointer listeners, and explicitly detach button listeners
   * before the normal teardown runs.
   *
   * Idempotent — safe to call more than once.
   */
  override destroy(options?: Parameters<Container['destroy']>[0]): void {
    if (this.isDestroyed) return;
    this.isDestroyed = true;
    this.removeAllListeners();
    for (const button of this.buttons) {
      button.removeAllListeners();
    }
    this.buttons = [];
    super.destroy(options ?? { children: true });
  }
}
