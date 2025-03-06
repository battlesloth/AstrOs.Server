import { Component, OnInit } from '@angular/core';
import { I2cEvent, ScriptEvent } from 'astros-common';
import {
  BaseEventModalComponent,
  ScriptEventModalResources,
} from '../base-event-modal/base-event-modal.component';
import { FormsModule } from '@angular/forms';
import { DecimalPipe } from '@angular/common';
import { ModalCallbackEvent } from '../../modal-base/modal-callback-event';

@Component({
  selector: 'app-i2c-event-modal',
  templateUrl: './i2c-event-modal.component.html',
  styleUrls: [
    '../base-event-modal/base-event-modal.component.scss',
    './i2c-event-modal.component.scss',
  ],
  imports: [FormsModule, DecimalPipe],
})
export class I2cEventModalComponent
  extends BaseEventModalComponent
  implements OnInit {
  channelId!: number;
  message: string;

  constructor() {
    super();
    this.originalEventTime = 0;
    this.eventTime = 0;
    this.message = '';
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

    const temp = this.scriptEvent.event as I2cEvent;

    if (temp !== undefined) {
      this.message = temp.message;
    }

    this.originalEventTime = this.scriptEvent.time / this.timeFactor;
    this.eventTime = this.scriptEvent.time / this.timeFactor;
  }

  addEvent() {
    if (+this.eventTime > this.maxTime) {
      this.errorMessage = `Event time cannot be larger than ${this.maxTime / this.timeFactor}`;
      return;
    }

    this.scriptEvent.time = +this.eventTime * this.timeFactor;

    this.scriptEvent.event = new I2cEvent(this.message);

    const evt = new ModalCallbackEvent(this.callbackType, {
      scriptEvent: this.scriptEvent,
      time: this.originalEventTime * this.timeFactor,
    });
    this.modalCallback.emit(evt);
  }
}
