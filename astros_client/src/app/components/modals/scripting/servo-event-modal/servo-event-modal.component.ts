import { Component, OnInit } from '@angular/core';
import { MaestroEvent, ModuleSubType, ScriptEvent } from 'astros-common';
import {
  BaseEventModalComponent,
  ScriptEventModalResources,
} from '../base-event-modal/base-event-modal.component';
import { FormsModule } from '@angular/forms';
import { DecimalPipe } from '@angular/common';
import { ModalCallbackEvent } from '../../modal-base/modal-callback-event';

@Component({
  selector: 'app-servo-event-modal',
  templateUrl: './servo-event-modal.component.html',
  styleUrls: [
    '../base-event-modal/base-event-modal.component.scss',
    './servo-event-modal.component.scss',
  ],
  imports: [FormsModule, DecimalPipe],
})
export class ServoEventModalComponent
  extends BaseEventModalComponent
  implements OnInit
{
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
      ScriptEventModalResources.scriptEvent,
    ) as ScriptEvent;

    if (this.scriptEvent.event === undefined) {
      this.position = 0;
      this.speed = 0;
      this.acceleration = 0;
    } else if (this.scriptEvent.moduleSubType === ModuleSubType.maestro) {
      const temp = this.scriptEvent.event as MaestroEvent;
      this.position = temp.position;
      this.speed = temp.speed;
      this.acceleration = temp.acceleration;
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

    if (this.scriptEvent.moduleSubType === ModuleSubType.maestro) {
      const data = new MaestroEvent(
        // channel will be set when persisting the event to the DB
        -1,
        true,
        this.position,
        this.speed,
        this.acceleration,
      );

      this.scriptEvent.event = data;
    }

    const evt = new ModalCallbackEvent(this.callbackType, {
      scriptEvent: this.scriptEvent,
      time: this.originalEventTime * this.timeFactor,
    });
    this.modalCallback.emit(evt);
  }
}
