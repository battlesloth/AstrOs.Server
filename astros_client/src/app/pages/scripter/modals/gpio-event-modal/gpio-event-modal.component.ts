import { Component, OnInit } from '@angular/core';
import { GpioEvent, ScriptEvent } from 'astros-common';
import { ModalCallbackEvent, ModalResources } from '../../../../shared/modal-resources';
import { BaseEventModalComponent } from '../base-event-modal/base-event-modal.component';

@Component({
  selector: 'app-gpio-event-modal',
  templateUrl: './gpio-event-modal.component.html',
  styleUrls: ['../base-event-modal/base-event-modal.component.scss', './gpio-event-modal.component.scss']
})
export class GpioEventModalComponent extends BaseEventModalComponent implements OnInit {

  channelId!: number;
  state: number = 0;

  constructor() {
    super();
    this.originalEventTime = 0;
    this.eventTime = 0;
    this.errorMessage = '';
    this.callbackType = ModalCallbackEvent.addEvent;
  }

  override ngOnInit(): void {
    if (this.resources.has(ModalResources.callbackType)) {
      this.callbackType = this.resources.get(ModalResources.callbackType);
    }

    if (this.callbackType === ModalCallbackEvent.editEvent) {
      var element = document.getElementById("remove_button");
      element?.classList.remove("hidden");
    }

    this.scriptEvent = <ScriptEvent>this.resources.get(ModalResources.scriptEvent);

    this.channelId = <number>this.resources.get(ModalResources.gpioId);

    if (this.scriptEvent.dataJson != '') {
      const payload = JSON.parse(this.scriptEvent.dataJson);
      this.channelId = this.channelId;
      this.state = payload.setHigh ? 1 : 0;
    }

    this.originalEventTime = this.scriptEvent.time / this.timeFactor;
    this.eventTime = this.scriptEvent.time / this.timeFactor;
  }

  selectChange($event: any) {
    this.state = $event.target.value;
  }

  addEvent() {

    if (+this.eventTime > this.maxTime) {
      this.errorMessage = `Event time cannot be larger than ${this.maxTime / this.timeFactor}`;
      return;
    }

    this.scriptEvent.time = +this.eventTime * this.timeFactor;

    const data = new GpioEvent(+this.channelId, +this.state === 1 ? true : false);

    this.scriptEvent.dataJson = JSON.stringify(data);

    this.modalCallback.emit({
      id: this.callbackType,
      scriptEvent: this.scriptEvent,
      originalEventTime: this.originalEventTime * this.timeFactor
    });
  }
}
