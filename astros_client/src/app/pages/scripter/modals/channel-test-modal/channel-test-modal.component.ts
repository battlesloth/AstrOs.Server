import { Component, OnInit } from '@angular/core';
import { ChannelType, ControllerType } from 'astros-common';
import { ModalCallbackEvent, ModalResources } from 'src/app/shared/modal-resources';
import { BaseEventModalComponent } from '../base-event-modal/base-event-modal.component';

@Component({
  selector: 'app-channel-test-modal',
  templateUrl: './channel-test-modal.component.html',
  styleUrls: ['../base-event-modal/base-event-modal.component.scss','./channel-test-modal.component.scss']
})
export class ChannelTestModalComponent extends BaseEventModalComponent implements OnInit{

  controller: ControllerType = ControllerType.none;
  channelId: number = 0;

  channelType: ChannelType = ChannelType.none;
  
  speed: number = 1;
  position: number = 0;
  value: string = '';

  constructor() {
    super();
    this.callbackType = ModalCallbackEvent.channelTest;
  }

  override ngOnInit(): void { 
    this.controller = <ControllerType> this.resources.get(ModalResources.controllerType);
    this.channelType = <ChannelType> this.resources.get(ModalResources.channelType);
    this.channelId = <number> this.resources.get(ModalResources.channelId);
  }

  runClicked(){
    this.modalCallback.emit({
      id: this.callbackType,
      controller: this.controller,
      commandType: this.channelType,
      command: this.getCommand() 
    });
  }

  getCommand(): any {
    switch (this.channelType){
      case ChannelType.i2c:
        return {id: this.channelId, val: this.value};
      case ChannelType.servo:
        return {id: this.channelId, position: this.position, speed: this.speed};
    }
    return {};
  }
}
