import { Component, OnInit } from '@angular/core';
import { ModalBaseComponent } from '../modal-base/modal-base.component';
import { ModalCallbackEvent } from '../modal-base/modal-callback-event';

export class AlertModalResources {
  public static message = 'message';
  public static closeEvent = 'alert_closeEvent';
}

@Component({
  selector: 'app-alert-modal',
  templateUrl: './alert-modal.component.html',
  styleUrl: './alert-modal.component.scss',
  standalone: true,
})
export class AlertModalComponent extends ModalBaseComponent implements OnInit {
  message!: string;
  closeEvent!: unknown;

  constructor() {
    super();
  }

  ngOnInit(): void {
    this.message = this.resources.get(AlertModalResources.message) as string;
    this.closeEvent = this.resources.get(AlertModalResources.closeEvent);
  }

  closeModal() {
    const evt = new ModalCallbackEvent(
      AlertModalResources.closeEvent,
      this.closeEvent,
    );

    this.modalCallback.emit(evt);
  }
}
