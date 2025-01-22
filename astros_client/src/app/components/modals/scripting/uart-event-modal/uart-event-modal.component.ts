import { Component, OnInit } from '@angular/core';
import { GenericSerialEvent, ScriptEvent } from 'astros-common';
import {
  BaseEventModalComponent,
  ScriptEventModalResources,
} from '../base-event-modal/base-event-modal.component';
import { FormsModule } from '@angular/forms';
import { DecimalPipe } from '@angular/common';
import { ModalCallbackEvent } from '../../modal-base/modal-callback-event';

export class UartEventModalResources {
  public static channelId = 'channelId';
  public static baudRate = 'baudRate';
  public static scriptEvent = 'scriptEvent';
}

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
  uartChannel!: number;
  baudRate!: number;
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

    this.uartChannel = this.resources.get(
      UartEventModalResources.channelId,
    ) as number;
    this.baudRate = this.resources.get(
      UartEventModalResources.baudRate,
    ) as number;

    this.scriptEvent = this.resources.get(
      UartEventModalResources.scriptEvent,
    ) as ScriptEvent;

    if (this.scriptEvent.dataJson != '') {
      const payload = JSON.parse(this.scriptEvent.dataJson);
      this.eventValue = payload.value;
    }

    this.originalEventTime = this.scriptEvent.time;
    this.eventTime = this.scriptEvent.time;
  }

  addEvent() {
    if (+this.eventTime > this.maxTime) {
      this.errorMessage = `Event time cannot be larger than ${this.maxTime}`;
      return;
    }

    this.scriptEvent.time = +this.eventTime;
    this.scriptEvent.dataJson = JSON.stringify(
      new GenericSerialEvent(this.uartChannel, this.baudRate, this.eventValue),
    );

    const evt = new ModalCallbackEvent(this.callbackType, {
      scriptEvent: this.scriptEvent,
      time: this.originalEventTime,
    });
    this.modalCallback.emit(evt);
  }
}
