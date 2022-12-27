import { Component, OnInit } from '@angular/core';
import { ScriptEvent, ServoEvent } from 'astros-common';
import { ModalCallbackEvent, ModalResources } from 'src/app/shared/modal-resources';
import { BaseEventModalComponent } from '../base-event-modal/base-event-modal.component';


@Component({
  selector: 'app-servo-event-modal',
  templateUrl: './servo-event-modal.component.html',
  styleUrls: ['../base-event-modal/base-event-modal.component.scss','./servo-event-modal.component.scss']
})
export class ServoEventModalComponent extends BaseEventModalComponent implements OnInit {

  channelId!: number;
  speed: number;
  position: number;
  
  constructor() {
    super();
    this.originalEventTime = 0;
    this.eventTime = 0;
    this.speed = 1;
    this.position = 0;
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
    
    this.channelId = <number> this.resources.get(ModalResources.servoId);

    if (this.scriptEvent.dataJson != ''){
      const payload = JSON.parse(this.scriptEvent.dataJson);
      this.channelId = payload.channelId;
      this.position = payload.position;
      this.speed = payload.speed;
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

    const data = new ServoEvent(+this.channelId, +this.position, +this.speed);
    this.scriptEvent.dataJson = JSON.stringify(data);

    this.modalCallback.emit({
      id: this.callbackType,
      scriptEvent: this.scriptEvent,
      originalEventTime: this.originalEventTime * this.timeFactor
    });
  }
}
