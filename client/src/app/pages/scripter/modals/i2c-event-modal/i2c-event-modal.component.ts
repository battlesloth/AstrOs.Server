import { Component, OnInit } from '@angular/core';
import { ChannelType } from 'src/app/models/control_module/control_module';
import { ModalBaseComponent } from '../../../../modal/modal-base/modal-base.component';
import { ModalCallbackEvent, ModalResources } from '../modal-resources';

@Component({
  selector: 'app-i2c-event-modal',
  templateUrl: './i2c-event-modal.component.html',
  styleUrls: ['./i2c-event-modal.component.scss']
})
export class I2cEventModalComponent extends ModalBaseComponent implements OnInit {

  eventTime: number;
  eventValue: string;
  errorMessage: string;
  maxTime: number = 300;
  
  constructor() {
    super();
    this.eventTime = 0;
    this.eventValue = '';
    this.errorMessage = '';
  }

  override ngOnInit(): void {
    if (this.resources.has(ModalResources.eventId)){
      const payload = JSON.parse(this.resources.get(ModalResources.payload));
      this.eventValue = payload.value;
    }
    this.eventTime = this.resources.get(ModalResources.time);
  }

  addEvent(){

    if (this.eventTime > this.maxTime){
      this.errorMessage = `Event time cannot be larger than ${this.maxTime}`;
      return;
    }

    this.modalCallback.emit({
      id: ModalCallbackEvent.addEvent,
      channelId: this.resources.get(ModalResources.channelId),
      channelType: ChannelType.i2c,
      time: +this.eventTime,
      payload: JSON.stringify({value: this.eventValue})
    });
  }

  closeModal(){
    this.modalCallback.emit({id: ModalCallbackEvent.close});
  }
}
