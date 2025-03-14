import { Component, OnInit } from '@angular/core';
import { GenericSerialEvent, ScriptEvent } from 'astros-common';
import {
  BaseEventModalComponent,
  ScriptEventModalResources,
} from '../base-event-modal/base-event-modal.component';
import { FormsModule } from '@angular/forms';
import { DecimalPipe } from '@angular/common';
import { ModalCallbackEvent } from '../../modal-base/modal-callback-event';

@Component({
  selector: 'app-uart-event-modal',
  templateUrl: './uart-event-modal.component.html',
  styleUrls: [
    '../base-event-modal/base-event-modal.component.scss',
    './uart-event-modal.component.scss',
  ],
  imports: [FormsModule, DecimalPipe],
})
export class UartEventModalComponent
  extends BaseEventModalComponent
  implements OnInit
{
  eventValue: string;

  constructor() {
    super();
    this.originalEventTime = 0;
    this.eventTime = 0;
    this.eventValue = '';
    this.errorMessage = '';
    this.callbackType = ScriptEventModalResources.addEvent;
  }

  ngOnInit(): void {
    if (this.resources.has(ScriptEventModalResources.callbackType)) {
      this.callbackType = this.resources.get(
        ScriptEventModalResources.callbackType,
      ) as string;
    }

    if (this.callbackType === ScriptEventModalResources.editEvent) {
      const element = document.getElementById('remove_button');
      element?.classList.remove('hidden');
    }

    this.scriptEvent = this.resources.get(
      ScriptEventModalResources.scriptEvent,
    ) as ScriptEvent;

    if (this.scriptEvent.event !== undefined) {
      const temp = this.scriptEvent.event as GenericSerialEvent;
      this.eventValue = temp.value;
    }

    this.originalEventTime = this.scriptEvent.time / this.timeFactor;
    this.eventTime = this.scriptEvent.time / this.timeFactor;
  }

  addEvent() {
    if (+this.eventTime > this.maxTime) {
      this.errorMessage = `Event time cannot be larger than ${this.maxTime}`;
      return;
    }

    this.scriptEvent.time = +this.eventTime;
    this.scriptEvent.event = new GenericSerialEvent(this.eventValue);

    const evt = new ModalCallbackEvent(this.callbackType, {
      scriptEvent: this.scriptEvent,
      time: this.originalEventTime,
    });
    this.modalCallback.emit(evt);
  }
}
