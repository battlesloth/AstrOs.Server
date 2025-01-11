import { Component, OnInit } from '@angular/core';
import { ModalBaseComponent, } from '../modal-base/modal-base.component'; 
import { ModalCallbackEvent } from '../modal-base/modal-callback-event';

export interface ConfirmModalEvent {
  id: string;
  val: unknown;
}

export class ConfirmModalResources {
  public static action = 'action';
  public static message = 'message';
  public static confirmEvent = 'confirm_confirmEvent';
  public static closeEvent = 'confirm_closeEvent';
}

@Component({
  selector: 'app-astros-confirm-modal',
  templateUrl: './confirm-modal.component.html',
  styleUrls: ['./confirm-modal.component.scss']
})
export class ConfirmModalComponent extends ModalBaseComponent implements OnInit {

  action!: string;
  message!: string;
  confirmEvent!: ConfirmModalEvent;
  closeEvent!: ConfirmModalEvent;

  constructor() { super() }

  ngOnInit(): void {
    this.action = this.resources.get(ConfirmModalResources.action) as string;
    this.message = this.resources.get(ConfirmModalResources.message) as string;
    this.confirmEvent = this.resources.get(ConfirmModalResources.confirmEvent) as ConfirmModalEvent;
    this.closeEvent = this.resources.get(ConfirmModalResources.closeEvent) as ConfirmModalEvent;
  }

  confirm() {
    const evt = new ModalCallbackEvent(
      ConfirmModalResources.confirmEvent,
      this.confirmEvent
    );
    this.modalCallback.emit(evt);
  }

  closeModal() {
    const evt = new ModalCallbackEvent(
      ConfirmModalResources.closeEvent,
      this.closeEvent
    );
    this.modalCallback.emit(evt);
  }
}
