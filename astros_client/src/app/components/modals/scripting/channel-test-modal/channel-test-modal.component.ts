import { Component, OnInit } from '@angular/core';
import { ChannelSubType, ChannelType, KangarooAction } from 'astros-common';
import { BaseEventModalComponent } from '../base-event-modal/base-event-modal.component';
import { NgIf } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ModalCallbackEvent } from '../../modal-base/modal-callback-event';

export class ChannelTestModalResources {
  public static controller = 'controller';
  public static channelType = 'channelType';
  public static channelSubType = 'channelSubType';
  public static channelId = 'channelId';

  public static channelTest = 'channelTest_test';
}

export interface ChannelTestModalResponse {
  controllerId: number;
  commandType: ChannelType;
  command: unknown;
}

@Component({
    selector: 'app-channel-test-modal',
    templateUrl: './channel-test-modal.component.html',
    styleUrls: [
        '../base-event-modal/base-event-modal.component.scss',
        './channel-test-modal.component.scss',
    ],
    imports: [NgIf, FormsModule]
})
export class ChannelTestModalComponent
  extends BaseEventModalComponent
  implements OnInit
{
  controllerId = 0;
  channelId = 0;

  channelType: ChannelType = ChannelType.none;
  channelSubType: ChannelSubType = ChannelSubType.none;

  speed = 1;
  position = 0;
  value = '';

  kangarooCh = 1;
  kangarooAction = 1;
  kangarooSpd?: number;
  kangarooPos?: number;
  spdDisabled = true;
  posDisabled = true;

  gpioLevel = 0;

  constructor() {
    super();
    this.callbackType = ChannelTestModalResources.channelTest;
  }

  ngOnInit(): void {
    this.controllerId = this.resources.get(
      ChannelTestModalResources.controller,
    ) as number;
    this.channelType = this.resources.get(
      ChannelTestModalResources.channelType,
    ) as ChannelType;
    this.channelSubType = this.resources.get(
      ChannelTestModalResources.channelSubType,
    ) as ChannelSubType;
    this.channelId = this.resources.get(
      ChannelTestModalResources.channelId,
    ) as number;
  }

  runClicked() {
    const evt = new ModalCallbackEvent(ChannelTestModalResources.channelTest, {
      controllerId: this.controllerId,
      commandType: this.channelType,
      command: this.getCommand(),
    });
    this.modalCallback.emit(evt);
  }

  getCommand(): unknown {
    switch (this.channelType) {
      case ChannelType.i2c:
        return { id: this.channelId, val: this.value };
      //case ChannelType.servo:
      //  return { id: this.channelId, position: this.position, speed: this.speed };
      case ChannelType.uart:
        if (this.channelSubType === ChannelSubType.kangaroo) {
          return { val: this.getKangarooCommand() };
        } else {
          return { val: this.value };
        }
      case ChannelType.gpio:
        return { id: this.channelId, val: this.gpioLevel };
    }
    return {};
  }

  selectChange($event: Event) {
    if (($event.target as HTMLInputElement).id === 'cmdselect') {
      this.spdDisabled =
        +this.kangarooAction !== 3 && +this.kangarooAction !== 4;
      this.posDisabled = +this.kangarooAction !== 4;

      if (+this.kangarooAction !== 3 && +this.kangarooAction !== 4) {
        this.kangarooSpd = 0;
      }
      if (+this.kangarooAction !== 4) {
        this.kangarooPos = 0;
      }
    }
  }

  getKangarooCommand(): string {
    let cmd = '';

    switch (+this.kangarooAction) {
      case KangarooAction.start:
        cmd = 'start';
        break;
      case KangarooAction.home:
        cmd = 'home';
        break;
      case KangarooAction.speed:
        cmd = `s${this.kangarooSpd === undefined ? 0 : this.kangarooSpd}`;
        break;
      case KangarooAction.position:
        cmd = `p${this.kangarooPos === undefined ? 0 : this.kangarooPos} s${this.kangarooSpd === undefined ? 0 : this.kangarooSpd}`;
        break;
    }

    return `${this.kangarooCh},${cmd}`;
  }
}
