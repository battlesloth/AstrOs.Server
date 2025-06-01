import { Component, OnInit } from '@angular/core';
import {
  KangarooAction,
  KangarooX2,
  KangarooEvent,
  ScriptEvent,
} from 'astros-common';
import {
  BaseEventModalComponent,
  ScriptEventModalResources,
} from '../base-event-modal/base-event-modal.component';
import { FormsModule } from '@angular/forms';
import { DecimalPipe } from '@angular/common';
import { ModalCallbackEvent } from '../../modal-base/modal-callback-event';

export class KangarooEventModalResources {
  static kangaroo = 'kangaroo';
}

@Component({
  selector: 'app-kangaroo-event-modal',
  templateUrl: './kangaroo-event-modal.component.html',
  styleUrls: [
    '../base-event-modal/base-event-modal.component.scss',
    './kangaroo-event-modal.component.scss',
  ],
  imports: [FormsModule, DecimalPipe],
})
export class KangarooEventModalComponent
  extends BaseEventModalComponent
  implements OnInit
{
  kangaroo!: KangarooX2;

  channel1: string;
  ch1Action: string;
  ch1Speed?: number;
  ch1Position?: number;
  ch1SpdDisabled: boolean;
  ch1PosDisabled: boolean;

  channel2: string;
  ch2Action: string;
  ch2Speed?: number;
  ch2Position?: number;
  ch2SpdDisabled: boolean;
  ch2PosDisabled: boolean;

  constructor() {
    super();
    this.originalEventTime = 0;
    this.eventTime = 0;

    this.channel1 = 'Channel 1';
    this.channel2 = 'Channel 2';

    this.ch1Action = '0';
    this.ch2Action = '0';

    this.ch1SpdDisabled = true;
    this.ch1PosDisabled = true;

    this.ch2SpdDisabled = true;
    this.ch2PosDisabled = true;

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

    this.kangaroo = this.resources.get(
      KangarooEventModalResources.kangaroo,
    ) as KangarooX2;

    this.scriptEvent = this.resources.get(
      ScriptEventModalResources.scriptEvent,
    ) as ScriptEvent;

    const temp = this.scriptEvent.event as KangarooEvent;

    if (temp !== undefined) {
      this.ch1Action = temp.ch1Action.toString();
      this.ch1Speed = temp.ch1Speed;
      this.ch1Position = temp.ch1Position;

      this.ch2Action = temp.ch2Action.toString();
      this.ch2Speed = temp.ch2Speed;
      this.ch2Position = temp.ch2Position;
    }

    this.ch1SpdDisabled =
      +this.ch1Action !== KangarooAction.speed &&
      +this.ch1Action !== KangarooAction.position;
    this.ch1PosDisabled = +this.ch1Action !== KangarooAction.position;

    this.ch2SpdDisabled =
      +this.ch2Action !== KangarooAction.speed &&
      +this.ch2Action !== KangarooAction.position;
    this.ch2PosDisabled = +this.ch2Action !== KangarooAction.position;

    this.originalEventTime = this.scriptEvent.time / this.timeFactor;
    this.eventTime = this.scriptEvent.time / this.timeFactor;
  }

  modalChange($event: Event) {
    if (($event.target as HTMLInputElement).id === 'ch1select') {
      this.ch1SpdDisabled = +this.ch1Action !== 3 && +this.ch1Action !== 4;
      this.ch1PosDisabled = +this.ch1Action !== 4;

      if (+this.ch1Action !== 3 && +this.ch1Action !== 4) {
        this.ch1Speed = undefined;
      }
      if (+this.ch1Action !== 4) {
        this.ch1Position = undefined;
      }
    } else if (($event.target as HTMLInputElement).id === 'ch2select') {
      this.ch2SpdDisabled = +this.ch2Action !== 3 && +this.ch2Action !== 4;
      this.ch2PosDisabled = +this.ch2Action !== 4;

      if (+this.ch2Action !== 3 && +this.ch2Action !== 4) {
        this.ch2Speed = undefined;
      }
      if (+this.ch2Action !== 4) {
        this.ch2Position = undefined;
      }
    }
  }

  addEvent() {
    if (+this.eventTime > this.maxTime) {
      this.errorMessage = `Event time cannot be larger than ${this.maxTime / this.timeFactor}`;
      return;
    }

    this.scriptEvent.time = +this.eventTime * this.timeFactor;

    const data = new KangarooEvent(
      +this.ch1Action,
      this.ch1Speed ?? 0,
      this.ch1Position ?? 0,
      +this.ch2Action,
      this.ch2Speed ?? 0,
      this.ch2Position ?? 0,
    );

    this.scriptEvent.event = data;

    const evt = new ModalCallbackEvent(this.callbackType, {
      scriptEvent: this.scriptEvent,
      time: this.originalEventTime * this.timeFactor,
    });
    this.modalCallback.emit(evt);
  }
}
