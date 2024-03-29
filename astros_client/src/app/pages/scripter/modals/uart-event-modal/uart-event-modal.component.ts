import { Component, OnInit } from '@angular/core';
import { GenericSerialEvent, ScriptEvent } from 'astros-common';
import { ModalCallbackEvent, ModalResources } from '../../../../shared/modal-resources';
import { BaseEventModalComponent } from '../base-event-modal/base-event-modal.component';

@Component({
  selector: 'app-uart-event-modal',
  templateUrl: './uart-event-modal.component.html',
  styleUrls: ['../base-event-modal/base-event-modal.component.scss','./uart-event-modal.component.scss']
})
export class UartEventModalComponent extends BaseEventModalComponent implements OnInit {

  uartChannel!: number;
  eventValue: string;
  
  constructor() {
    super();
    this.originalEventTime = 0;
    this.eventTime = 0;
    this.eventValue = '';
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

    this.uartChannel = this.resources.get(ModalResources.channelId);

    this.scriptEvent = <ScriptEvent> this.resources.get(ModalResources.scriptEvent);
    
    if (this.scriptEvent.dataJson != ''){
      const payload = JSON.parse(this.scriptEvent.dataJson);
      this.eventValue = payload.value;
    }
    
    this.originalEventTime = this.scriptEvent.time;
    this.eventTime = this.scriptEvent.time;
  }

  addEvent(){

    if (+this.eventTime > this.maxTime){
      this.errorMessage = `Event time cannot be larger than ${this.maxTime}`;
      return;
    }
   
    this.scriptEvent.time = +this.eventTime;
    this.scriptEvent.dataJson = JSON.stringify(new GenericSerialEvent(this.uartChannel, this.eventValue));

    this.modalCallback.emit({
      id: this.callbackType,
      scriptEvent: this.scriptEvent,
      originalEventTime: this.originalEventTime
    });
  }
}
