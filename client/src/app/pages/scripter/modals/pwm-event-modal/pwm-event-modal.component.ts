import { Component, OnInit } from '@angular/core';
import { ScriptEvent } from 'src/app/models/scripts/script_event';
import { ModalCallbackEvent, ModalResources } from 'src/app/shared/modal-resources';
import { ModalBaseComponent } from '../../../../modal/modal-base/modal-base.component';

@Component({
  selector: 'app-pwm-event-modal',
  templateUrl: './pwm-event-modal.component.html',
  styleUrls: ['./pwm-event-modal.component.scss']
})
export class PwmEventModalComponent extends ModalBaseComponent implements OnInit {

  private scriptEvent!: ScriptEvent;
  private originalEventTime: number;
  private callbackType: ModalCallbackEvent;

  eventTime: number;
  eventValue: string;
  errorMessage: string;
  maxTime: number = 300;
  
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
    this.scriptEvent.dataJson = JSON.stringify({value: this.eventValue});

    this.modalCallback.emit({
      id: this.callbackType,
      scriptEvent: this.scriptEvent,
      originalEventTime: this.originalEventTime
    });
  }

  removeEvent(){
    this.modalCallback.emit({
      id: ModalCallbackEvent.removeEvent,
      channelId: this.scriptEvent.scriptChannel,
      time: this.originalEventTime
    })
  }
  
  closeModal(){
    this.modalCallback.emit({id: ModalCallbackEvent.close});
  }
}
