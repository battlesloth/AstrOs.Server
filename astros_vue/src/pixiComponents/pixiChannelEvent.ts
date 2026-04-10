import { KangarooAction, ModuleType, ScriptChannelType } from '@/enums';
import type { ScriptEvent } from '@/models/scripts/scriptEvent';
import { Assets, Container, FederatedPointerEvent, Graphics, Sprite, Texture } from 'pixi.js';
import { getText, getTruncatedText } from './helpers';
import type {
  GenericSerialEvent,
  GpioEvent,
  I2cEvent,
  KangarooEvent,
  MaestroEvent,
} from '@/models';

export interface PixiChannelEventOptions {
  channelId: string;
  deciseconds: number;
  scriptEvent: ScriptEvent;
  scriptChannelType: ScriptChannelType;
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
  scriptChannelType: ScriptChannelType;
  options: PixiChannelEventOptions;
  boxWidth: number;
  boxHeight: number;
  private isDestroyed = false;

  constructor(options: PixiChannelEventOptions) {
    super();
    this.channelId = options.channelId;
    this.deciseconds = options.deciseconds;
    this.scriptEvent = options.scriptEvent;
    this.scriptChannelType = options.scriptChannelType;
    this.options = options;

    this.boxHeight = options.rowHeight - 10;
    this.boxWidth = 60;
    this.pivot.set(this.boxWidth / 2, 0);

    const pixelPosition =
      (options.deciseconds / options.timelineDurationSeconds) * options.timelineWidth;
    this.x = pixelPosition;
    this.y = 5;

    this.eventMode = 'static';
    this.cursor = 'grab';

    this.setContainerContent();

    this.on('pointertap', (event: FederatedPointerEvent) => {
      options.onPointerTap?.(event, this.options.scriptEvent);
    });

    this.on('pointerdown', (event: FederatedPointerEvent) => {
      options.onPointerDown?.(event, this);
    });
  }

  setContainerContent() {
    switch (this.scriptChannelType) {
      case ScriptChannelType.SERVO:
        this.setServoBackground();
        break;
      case ScriptChannelType.GPIO:
        this.setGpioBackground(this.scriptEvent.moduleType);
        break;
      case ScriptChannelType.AUDIO:
        this.setAudioBackground();
        break;
      case ScriptChannelType.GENERIC_I2C:
        this.setI2CBackground();
        break;
      case ScriptChannelType.GENERIC_UART:
        this.setSerialBackground();
        break;
      case ScriptChannelType.KANGAROO:
        this.setKangarooBackground();
        break;
      default:
        this.setDefaultBackground();
        break;
    }
  }

  /**
   * Loads a texture asynchronously and applies it via the callback, but
   * aborts if the container has been destroyed in the meantime. This guards
   * against `.then()` callbacks firing after unmount, which would add
   * children to a destroyed container.
   */
  private loadAsset(asset: string, apply: (texture: Texture) => void) {
    Assets.load(asset).then((texture: Texture) => {
      if (this.isDestroyed) return;
      apply(texture);
    });
  }

  setServoBackground() {
    this.setBackground(this.getBackgroundColor(), this.getBorderColor());

    const evt = this.scriptEvent.event as MaestroEvent;

    if (evt.position === -1) {
      this.loadAsset('home', (texture) => {
        this.setIcon(texture, this.getTextColor());
      });
      return;
    }

    const speedColor = this.getSpeedToColor(evt.speed);

    this.loadAsset('servo', (texture) => {
      this.setIcon(texture, speedColor, 0.45, 2);
    });

    // Map position 0-100 to angle -90 to 90 degrees, then convert to radians
    const degrees = ((evt.position - 50) / 50) * 90;
    const angle = (degrees * Math.PI) / 180;
    this.setPinIcon(angle);
  }

  setGpioBackground(moduleType: ModuleType) {
    this.setBackground(this.getBackgroundColor(), this.getBorderColor());

    let isHigh = false;

    if (moduleType === ModuleType.GPIO) {
      const evt = this.scriptEvent.event as GpioEvent;
      isHigh = evt.setHigh;
    } else if (moduleType === ModuleType.UART) {
      const evt = this.scriptEvent.event as MaestroEvent;
      isHigh = evt.position > 1500; // for HCR, treat position > 1500 as high
    } else {
      this.setDefaultBackground();
      return;
    }

    if (isHigh) {
      this.loadAsset('arrowUp', (texture) => {
        this.setIcon(texture, 0x00e500);
      });
    } else {
      this.loadAsset('arrowDown', (texture) => {
        this.setIcon(texture, 0xbbbbbb);
      });
    }
  }

  setAudioBackground() {
    this.setBackground(this.getBackgroundColor(), this.getBorderColor());
    this.loadAsset('start', (texture) => {
      this.setIcon(texture, this.getTextColor());
    });
  }

  setI2CBackground() {
    this.setBackground(this.getBackgroundColor(), this.getBorderColor());
    this.loadAsset('i2c', (texture) => {
      this.setIcon(texture, this.getTextColor(), 0.28, -10);
    });

    const evt = this.scriptEvent.event as I2cEvent;
    const error = getTruncatedText(evt.message, 0x000000, this.boxWidth, 14);
    error.anchor.set(0.5, 0);
    error.x = this.boxWidth / 2;
    error.y = this.boxHeight / 2 + 16;
    this.addChild(error);
  }

  setSerialBackground() {
    this.setBackground(this.getBackgroundColor(), this.getBorderColor());
    this.loadAsset('serial', (texture) => {
      this.setIcon(texture, this.getTextColor(), 0.33, -10);
    });

    const evt = this.scriptEvent.event as GenericSerialEvent;
    const error = getTruncatedText(evt.value, 0x000000, this.boxWidth, 14);
    error.anchor.set(0.5, 0);
    error.x = this.boxWidth / 2;
    error.y = this.boxHeight / 2 + 16;
    this.addChild(error);
  }

  setKangarooBackground() {
    this.setBackground(this.getBackgroundColor(), this.getBorderColor());
    const evt = this.scriptEvent.event as KangarooEvent;

    this.setKangarooChIcon(evt.ch1Action, 1);
    this.setKangarooChIcon(evt.ch2Action, 2);

    // add divider line
    const line = new Graphics();
    line.moveTo(5, this.boxHeight / 2);
    line.lineTo(this.boxWidth - 5, this.boxHeight / 2);
    line.stroke({ width: 2, color: this.getBorderColor() });
    this.addChild(line);
  }

  setKangarooChIcon(action: KangarooAction, ch: number) {
    const scale = 0.2;
    const offset = this.boxHeight / 4;
    const offsetY = ch === 1 ? -offset : offset;

    switch (action) {
      case KangarooAction.HOME:
        this.loadAsset('home', (texture) => {
          this.setIcon(texture, this.getTextColor(), scale, offsetY);
        });
        break;
      case KangarooAction.START:
        this.loadAsset('start', (texture) => {
          this.setIcon(texture, this.getTextColor(), scale, offsetY);
        });
        break;
      case KangarooAction.NONE:
        this.loadAsset('none', (texture) => {
          this.setIcon(texture, 0xbbbbbb, scale, offsetY);
        });
        break;
      default:
        this.loadAsset('dial', (texture) => {
          this.setIcon(texture, this.getTextColor(), scale, offsetY);
        });
        this.loadAsset('pointer', (texture) => {
          this.setIcon(texture, this.getTextColor(), scale, offsetY);
        });
        break;
    }
  }

  setDefaultBackground() {
    this.setBackground(0xff0000, 0xaa0000);

    const error = getText('Error', 0xffffff, 20);
    error.anchor.set(0.5, 0);
    error.x = this.boxWidth / 2;
    error.y = this.boxHeight / 2 - error.height / 2;
    this.addChild(error);
  }

  setBackground(color: number, borderColor: number) {
    const background = new Graphics();
    background.rect(0, 0, this.boxWidth, this.boxHeight);
    background.fill(color);
    background.stroke({ width: 2, color: borderColor });
    this.addChild(background);
  }

  setIcon(texture: Texture, color: number, scale?: number, offsetY?: number) {
    const icon = new Sprite(texture);
    icon.anchor.set(0.5);
    icon.tint = color;
    icon.scale.set(scale ?? 0.33, scale ?? 0.33);
    icon.x = this.boxWidth / 2;
    icon.y = this.boxHeight / 2 + (offsetY ?? 0);
    this.addChild(icon);
  }

  setPinIcon(rotation: number, scale?: number, offsetY?: number) {
    this.loadAsset('servo_arm', (texture) => {
      const icon = new Sprite(texture);
      icon.anchor.set(0.5, 0.4);
      icon.rotation = rotation ?? 0;
      icon.scale.set(scale ?? 0.45, scale ?? 0.45);
      icon.x = this.boxWidth / 2;
      icon.y = this.boxHeight / 2 - 8 + (offsetY ?? 0);
      this.addChild(icon);
    });
  }

  getSpeedToColor(speed: number) {
    // if speed is 0, return red
    // as speed 0 means unlimited speed for Maestro
    if (speed === 0) {
      return 0xff0000;
    }

    // Map speed 1-255: Green (1) -> Yellow (127.5/50%) -> Orange (191/75%) -> Red (255)
    let r, g, b;
    const b_base = 60;

    if (speed <= 127.5) {
      // Phase 1: Green to Yellow (0 to 50%)
      const t = speed / 127.5;
      r = Math.floor(120 + t * 110); // 120 -> 230
      g = Math.floor(200 + t * 30); // 200 -> 230
      b = b_base;
    } else {
      // Phase 2: Yellow to Red (50% to 100%)
      const t = (speed - 127.5) / 127.5;
      r = 230; // Keep red constant
      g = Math.floor(230 - t * 166); // 230 -> 64
      b = b_base;
    }

    return (r << 16) | (g << 8) | b;
  }

  getBackgroundColor() {
    return this.options.eventColor ?? 0xf5f5f5;
  }

  getBorderColor() {
    return this.options.borderColor ?? 0x3a3a3a;
  }

  getTextColor() {
    return this.options.textColor ?? 0xffffff;
  }

  /**
   * Rebuilds the visual content of the event box
   * Call this after updating scriptEvent data to refresh the display
   */
  rebuild() {
    if (this.isDestroyed) return;

    // Destroy and remove all existing children to avoid leaking Pixi objects
    while (this.children.length > 0) {
      const child = this.removeChildAt(0);
      if (child && 'destroy' in child && typeof child.destroy === 'function') {
        child.destroy({ children: true });
      }
    }

    // Redraw with updated data
    this.setContainerContent();
  }

  /**
   * Override of Pixi's Container.destroy so we can mark the instance as
   * destroyed (which short-circuits any in-flight Assets.load callbacks) and
   * explicitly detach pointer listeners before the normal teardown runs.
   *
   * Idempotent — safe to call more than once.
   */
  override destroy(options?: Parameters<Container['destroy']>[0]): void {
    if (this.isDestroyed) return;
    this.isDestroyed = true;
    this.removeAllListeners();
    super.destroy(options ?? { children: true });
  }
}
