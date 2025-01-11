import { Component } from '@angular/core';
import { ModalBaseComponent } from '@src/components/modals/modal-base/modal-base.component';
import { ModalCallbackEvent } from '@src/components/modals/modal-base/modal-callback-event';
import { ScriptEvent } from 'astros-common';

export class ScriptEventModalResources {
  public static scriptEvent = 'scriptEvent';
  public static callbackType = 'callbackType';
  public static addEvent = 'script_addEvent';
  public static editEvent = 'script_editEvent';
  public static removeEvent = 'script_removeEvent';
  public static closeEvent = 'script_closeEvent';
}

export interface ScriptEventModalResponse {
  scriptEvent: ScriptEvent;
  time: number;
}

@Component({
  selector: 'app-base-event-modal',
  template: '',
  styleUrls: ['./base-event-modal.component.scss'],
  standalone: true,
})
export class BaseEventModalComponent extends ModalBaseComponent {
  protected scriptEvent!: ScriptEvent;
  protected originalEventTime: number;
  protected callbackType: string;

  eventTime: number;
  protected maxTime = 3000;
  protected timeFactor = 10;

  errorMessage: string;

  constructor() {
    super();
    this.originalEventTime = 0;
    this.eventTime = 0;

    this.errorMessage = '';
    this.callbackType = ScriptEventModalResources.addEvent;
  }

  removeEvent() {
    const evt = new ModalCallbackEvent(ScriptEventModalResources.removeEvent, {
      scriptEvent: this.scriptEvent,
      time: this.originalEventTime * this.timeFactor,
    });
    this.modalCallback.emit(evt);
  }

  closeModal() {
    const evt = new ModalCallbackEvent(
      ScriptEventModalResources.closeEvent,
      null,
    );

    this.modalCallback.emit(evt);
  }
}
