import { Component, OnInit } from '@angular/core';
import { ChannelSubType, ChannelType, KangarooAction } from 'astros-common';
import { ModalCallbackEvent, ModalResources } from 'src/app/shared/modal-resources';
import { BaseEventModalComponent } from '../base-event-modal/base-event-modal.component';

@Component({
  selector: 'app-channel-test-modal',
  templateUrl: './channel-test-modal.component.html',
  styleUrls: ['../base-event-modal/base-event-modal.component.scss', './channel-test-modal.component.scss']
})
export class ChannelTestModalComponent extends BaseEventModalComponent implements OnInit {

  controllerId: number = 0;
  channelId: number = 0;

  channelType: ChannelType = ChannelType.none;
  channelSubType: ChannelSubType = ChannelSubType.none;

  speed: number = 1;
  position: number = 0;
  value: string = '';

  kangarooCh: number = 1;
  kangarooAction: number = 1;
  kangarooSpd?: number;
  kangarooPos?: number;
  spdDisabled: boolean = true;
  posDisabled: boolean = true;

  gpioLevel: number = 0;

  constructor() {
    super();
    this.callbackType = ModalCallbackEvent.channelTest;
  }

  override ngOnInit(): void {
    this.controllerId = <number>this.resources.get(ModalResources.controllerType);
    this.channelType = <ChannelType>this.resources.get(ModalResources.channelType);
    this.channelSubType = <ChannelSubType>this.resources.get(ModalResources.channelSubType)
    this.channelId = <number>this.resources.get(ModalResources.channelId);
  }

  runClicked() {
    this.modalCallback.emit({
      id: this.callbackType,
      controllerId: this.controllerId,
      commandType: this.channelType,
      command: this.getCommand()
    });
  }

  getCommand(): any {
    switch (this.channelType) {
      case ChannelType.i2c:
        return { id: this.channelId, val: this.value };
      case ChannelType.servo:
        return { id: this.channelId, position: this.position, speed: this.speed };
      case ChannelType.uart:
        if (this.channelSubType == ChannelSubType.kangaroo) {
          return { val: this.getKangarooCommand() };
        } else {
          return { val: this.value };
        }
      case ChannelType.gpio:
        return { id: this.channelId, val: this.gpioLevel };
    }
    return {};
  }

  selectChange($event: any) {
    if ($event.target.id === 'cmdselect') {

      this.spdDisabled = +this.kangarooAction !== 3 && +this.kangarooAction !== 4;
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
        cmd = 'start'
        break;
      case KangarooAction.home:
        cmd = 'home'
        break;
      case KangarooAction.speed:
        cmd = `s${this.kangarooSpd === undefined ? 0 : this.kangarooSpd}`
        break;
      case KangarooAction.position:
        cmd = `p${this.kangarooPos === undefined ? 0 : this.kangarooPos} s${this.kangarooSpd === undefined ? 0 : this.kangarooSpd}`
        break;
    }

    return `${this.kangarooCh},${cmd}`;
  }
}
