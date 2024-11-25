import { Component, OnInit } from '@angular/core';
import { BaseEventModalComponent } from '../../scripter/modals/base-event-modal/base-event-modal.component';
import { ModalCallbackEvent, ModalResources } from 'src/app/shared/modal-resources';


@Component({
  selector: 'app-servo-test-modal',
  templateUrl: './servo-test-modal.component.html',
  styleUrl: './servo-test-modal.component.scss'
})
export class ServoTestModalComponent extends BaseEventModalComponent implements OnInit {
   
  servoId: number = 0;
  controllerId: number = 0;
  disableSlider: boolean = true;
  value: number = 1500;

  constructor() {
    super();
  }

  override ngOnInit(): void {
    this.servoId = this.resources.get(ModalResources.servoId);
    this.controllerId = this.resources.get(ModalResources.controllerId);
  }

  onSliderChange(event: any) {
    this.modalCallback.emit({
      id: ModalCallbackEvent.sendServoMove,
      controllerId: this.controllerId,
      servoId: this.servoId,
      value: this.value
    })
  }

  enableTest() {
    this.disableSlider = false;
  }

  override closeModal(): void {
    this.modalCallback.emit({ id: ModalCallbackEvent.close });
  }
}
