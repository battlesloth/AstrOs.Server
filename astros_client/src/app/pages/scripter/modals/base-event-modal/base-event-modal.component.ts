import { Component, OnInit } from '@angular/core';
import { ModalBaseComponent } from 'src/app/modal';
import { ScriptEvent } from 'astros-common';
import { ModalCallbackEvent } from 'src/app/shared/modal-resources';

@Component({
    selector: 'app-base-event-modal',
    template: '',
    styleUrls: ['./base-event-modal.component.scss'],
    standalone: true
})
export class BaseEventModalComponent extends ModalBaseComponent implements OnInit {

  protected scriptEvent!: ScriptEvent;
  protected originalEventTime: number;
  protected callbackType: ModalCallbackEvent;

  eventTime: number;
  protected maxTime = 3000;
  protected timeFactor = 10;

  errorMessage: string;
  
  constructor() { 
    super();
    this.originalEventTime = 0;
    this.eventTime = 0;

    this.errorMessage = '';
    this.callbackType = ModalCallbackEvent.addEvent;
  }

  override ngOnInit(): void {

  }

  removeEvent(){
    this.modalCallback.emit({
      id: ModalCallbackEvent.removeEvent,
      channelId: this.scriptEvent.scriptChannel,
      time: this.originalEventTime * this.timeFactor
    })
  }

  closeModal(){
    this.modalCallback.emit({id: ModalCallbackEvent.close});
  }

}
