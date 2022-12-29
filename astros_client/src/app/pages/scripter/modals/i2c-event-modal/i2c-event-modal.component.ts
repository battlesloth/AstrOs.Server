import { Component, OnInit } from '@angular/core';
import { I2cEvent, ScriptEvent } from 'astros-common';
import { ModalCallbackEvent, ModalResources } from '../../../../shared/modal-resources';
import { BaseEventModalComponent } from '../base-event-modal/base-event-modal.component';

@Component({
  selector: 'app-i2c-event-modal',
  templateUrl: './i2c-event-modal.component.html',
  styleUrls: ['../base-event-modal/base-event-modal.component.scss','./i2c-event-modal.component.scss']
})
export class I2cEventModalComponent extends BaseEventModalComponent implements OnInit {
 
  channelId!: number;
  message: string;

  constructor() {
    super();
    this.originalEventTime = 0;
    this.eventTime = 0;
    this.message = '';
    this.errorMessage = '';
    this.callbackType = ModalCallbackEvent.addEvent;
  }

  override ngOnInit(): void {
    if (this.resources.has(ModalResources.callbackType)){
      this.callbackType = this.resources.get(ModalResources.callbackType);
    }

    if (this.callbackType === ModalCallbackEvent.editEvent){
      var element = document.getElementById("remove_button");
      element?.classList.remove("hidden");
    }

    this.scriptEvent = <ScriptEvent> this.resources.get(ModalResources.scriptEvent);
    
    this.channelId = <number> this.resources.get(ModalResources.i2cId);

    if (this.scriptEvent.dataJson != ''){
      const payload = JSON.parse(this.scriptEvent.dataJson);
      this.channelId = this.channelId;
      this.message= payload.message;
    }
    
    this.originalEventTime = this.scriptEvent.time / this.timeFactor;
    this.eventTime = this.scriptEvent.time / this.timeFactor;
  }

  addEvent(){

    if (+this.eventTime > this.maxTime){
      this.errorMessage = `Event time cannot be larger than ${this.maxTime/this.timeFactor}`;
      return;
    }
   
    this.scriptEvent.time = +this.eventTime * this.timeFactor;
    
    const data = new I2cEvent( +this.channelId, this.message);
    
    this.scriptEvent.dataJson = JSON.stringify(data);

    this.modalCallback.emit({
      id: this.callbackType,
      scriptEvent: this.scriptEvent,
      originalEventTime: this.originalEventTime * this.timeFactor
    });
  }
}
