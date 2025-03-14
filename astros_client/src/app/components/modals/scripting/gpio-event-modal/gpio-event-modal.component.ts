import { Component, OnInit } from '@angular/core';
import {
  GpioEvent,
  MaestroEvent,
  ModuleSubType,
  ScriptEvent,
} from 'astros-common';
import {
  BaseEventModalComponent,
  ScriptEventModalResources,
} from '../base-event-modal/base-event-modal.component';
import { FormsModule } from '@angular/forms';
import { DecimalPipe } from '@angular/common';
import { ModalCallbackEvent } from '../../modal-base/modal-callback-event';

@Component({
  selector: 'app-gpio-event-modal',
  templateUrl: './gpio-event-modal.component.html',
  styleUrls: [
    '../base-event-modal/base-event-modal.component.scss',
    './gpio-event-modal.component.scss',
  ],
  imports: [FormsModule, DecimalPipe],
})
export class GpioEventModalComponent
  extends BaseEventModalComponent
  implements OnInit
{
  state = 0;

  constructor() {
    super();
    this.originalEventTime = 0;
    this.eventTime = 0;
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

    if (this.scriptEvent.event === undefined) {
      this.state = 0;
    } else if (this.scriptEvent.moduleSubType === ModuleSubType.genericGpio) {
      const temp = this.scriptEvent.event as GpioEvent;
      this.state = temp.setHigh ? 1 : 0;
    } else if (this.scriptEvent.moduleSubType === ModuleSubType.maestro) {
      const temp = this.scriptEvent.event as MaestroEvent;
      this.state = temp.position >= 1500 ? 1 : 0;
    }

    this.originalEventTime = this.scriptEvent.time / this.timeFactor;
    this.eventTime = this.scriptEvent.time / this.timeFactor;
  }

  selectChange($event: Event) {
    this.state = +($event.target as HTMLInputElement).value;
  }

  addEvent() {
    if (+this.eventTime > this.maxTime) {
      this.errorMessage = `Event time cannot be larger than ${this.maxTime / this.timeFactor}`;
      return;
    }

    this.scriptEvent.time = +this.eventTime * this.timeFactor;

    if (this.scriptEvent.moduleSubType === ModuleSubType.genericGpio) {
      this.scriptEvent.event = new GpioEvent(+this.state === 1 ? true : false);
    } else if (this.scriptEvent.moduleSubType === ModuleSubType.maestro) {
      this.scriptEvent.event = new MaestroEvent(
        false,
        +this.state === 1 ? 2500 : 500,
        0,
        0,
      );
    }

    const evt = new ModalCallbackEvent(this.callbackType, {
      scriptEvent: this.scriptEvent,
      time: this.originalEventTime,
    });
    this.modalCallback.emit(evt);
  }
}
