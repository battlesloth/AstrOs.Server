import { Component, OnInit } from '@angular/core';
import { ScriptEvent } from 'astros-common';
import {
  BaseEventModalComponent,
  ScriptEventModalResources,
} from '../base-event-modal/base-event-modal.component';
import { FormsModule } from '@angular/forms';
import { DecimalPipe } from '@angular/common';
import { ModalCallbackEvent } from '../../modal-base/modal-callback-event';

export class ServoEventModalResources {
  public static servoId = 'servoId';
  public static scriptEvent = 'scriptEvent';
}

@Component({
  selector: 'app-servo-event-modal',
  templateUrl: './servo-event-modal.component.html',
  styleUrls: [
    '../base-event-modal/base-event-modal.component.scss',
    './servo-event-modal.component.scss',
  ],
  standalone: true,
  imports: [FormsModule, DecimalPipe],
})
export class ServoEventModalComponent
  extends BaseEventModalComponent
  implements OnInit
{
  channelId!: number;
  speed: number;
  position: number;
  acceleration: number;

  constructor() {
    super();
    this.originalEventTime = 0;
    this.eventTime = 0;
    this.speed = 1;
    this.position = 0;
    this.acceleration = 0;
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
      ServoEventModalResources.scriptEvent,
    ) as ScriptEvent;

    this.channelId = this.resources.get(
      ServoEventModalResources.servoId,
    ) as number;

    if (this.scriptEvent.dataJson != '') {
      console.log(this.scriptEvent.dataJson);
      const payload = JSON.parse(this.scriptEvent.dataJson);
      this.channelId = payload.channelId;
      this.position = payload.position;
      this.speed = payload.speed;
      this.acceleration = payload.acceleration;
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

    //const data = new ServoEvent(+this.channelId, +this.position, +this.speed, +this.acceleration);
    //this.scriptEvent.dataJson = JSON.stringify(data);

    const evt = new ModalCallbackEvent(this.callbackType, {
      scriptEvent: this.scriptEvent,
      time: this.originalEventTime * this.timeFactor,
    });
    this.modalCallback.emit(evt);
  }
}
