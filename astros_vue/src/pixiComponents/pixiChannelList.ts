import { Container, TextStyle, Text, Graphics, FillGradient } from 'pixi.js';
import type { PixiChannelData } from './pixiChannelData';

export interface PixiChannelListOptions {
  width: number;
  height: number;
  buttonHeight: number;
  emitAddChannel: () => void;
}

export class PixiChannelList extends Container {
  backgroundColor: number = 0x2a2a2a;
  buttonColor: number = 0x4a90e2;
  buttonTextColor: number = 0xffffff;
  buttonHoverColor: number = 0x5aa0f2;

  options: PixiChannelListOptions;
  containerWidth: number;

  channels: Map<string, PixiChannelData> = new Map();

  channelListScrollableContainer: Container | null = null;

  constructor(options: PixiChannelListOptions) {
    super();
    this.options = options;
    this.containerWidth = options.width;
    this.redraw(options.height);
  }

  redraw(height: number) {
    this.removeChildren();

    const background = new Graphics()
      .rect(0, 0, this.containerWidth, height)
      .fill(this.backgroundColor);

    this.addChild(background);

    this.channelListScrollableContainer = new Container();
    this.channelListScrollableContainer.y = this.options.buttonHeight;
    this.addChild(this.channelListScrollableContainer);

    // Create "Add Channel" button at the top (fixed position)
    const buttonHeight = this.options.buttonHeight;
    const buttonContainer = new Container();
    buttonContainer.eventMode = 'static';
    buttonContainer.cursor = 'pointer';

    const button = new Graphics();
    button.rect(0, 0, this.containerWidth, buttonHeight).fill(this.buttonColor);

    buttonContainer.addChild(button);

    // Add hover effect
    buttonContainer.on('pointerover', () => {
      button.clear();
      button.rect(0, 0, this.containerWidth, buttonHeight).fill(this.buttonHoverColor);
    });

    buttonContainer.on('pointerout', () => {
      button.clear();
      button.rect(0, 0, this.containerWidth, buttonHeight).fill(this.buttonColor);
    });

    buttonContainer.on('pointertap', () => {
      this.options.emitAddChannel();
    });

    const fill = new FillGradient(0, 0, 1, 1);
    fill.addColorStop(0, this.buttonTextColor);
    fill.addColorStop(1, this.buttonTextColor);

    const style = new TextStyle({
      fontFamily: 'Arial',
      fontSize: 20,
      fontWeight: 'bold',
      fill: fill,
    });

    const buttonText = new Text({
      text: 'Add Channel',
      style: style,
    });

    // Center the text
    requestAnimationFrame(() => {
      if (buttonText.width > 0 && buttonText.height > 0) {
        buttonText.x = (this.containerWidth - buttonText.width) / 2;
        buttonText.y = (buttonHeight - buttonText.height) / 2;
      }
    });

    buttonText.x = this.containerWidth / 2 - 40;
    buttonText.y = buttonHeight / 2 - 8;

    buttonContainer.addChild(buttonText);
    buttonContainer.zIndex = 10; // Ensure it's on top
    this.addChild(buttonContainer);
  }

  addChannelRow(row: PixiChannelData) {
    this.channels.set(row.channelId, row);
    if (this.channelListScrollableContainer) {
      this.channelListScrollableContainer.addChild(row);
    }
  }

  removeChannelRow(channelId: string) {
    const row = this.channels.get(channelId);
    if (row && this.channelListScrollableContainer) {
      this.channelListScrollableContainer.removeChild(row);
      this.channels.delete(channelId);
    }
  }

  updateChannel(chId: string, name: string) {
    const row = this.channels.get(chId);
    if (row) {
      row.updateChannel(name);
    }
  }

  updateChannelIndex(channelId: string, newIdx: number) {
    const row = this.channels.get(channelId);
    if (row) {
      row.updateIdx(newIdx);
    }
  }

  setScrollableY(y: number) {
    if (this.channelListScrollableContainer) {
      this.channelListScrollableContainer.y = this.options.buttonHeight - y;
    }
  }
}
