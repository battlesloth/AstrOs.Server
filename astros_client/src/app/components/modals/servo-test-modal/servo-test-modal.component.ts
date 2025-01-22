import { Component, OnInit } from '@angular/core';
import { BaseEventModalComponent } from '../scripting/base-event-modal/base-event-modal.component';
import { MatSlider, MatSliderThumb } from '@angular/material/slider';
import { FormsModule } from '@angular/forms';
import { ModalCallbackEvent } from '../modal-base/modal-callback-event';

export class ServoTestModalResources {
  public static servoId = 'servoId';
  public static controllerId = 'controllerId';
  public static sendServoMove = 'servoTest_servoMove';
  public static closeEvent = 'servoTest_closeEvent';
}

export interface ServoTestMessage {
  controllerId: number;
  servoId: number;
  value: number;
}

@Component({
    selector: 'app-servo-test-modal',
    templateUrl: './servo-test-modal.component.html',
    styleUrl: './servo-test-modal.component.scss',
    imports: [MatSlider, MatSliderThumb, FormsModule]
})
export class ServoTestModalComponent
  extends BaseEventModalComponent
  implements OnInit
{
  servoId = 0;
  controllerId = 0;
  disableSlider = true;
  value = 1500;

  constructor() {
    super();
  }

  ngOnInit(): void {
    this.servoId = this.resources.get(
      ServoTestModalResources.servoId,
    ) as number;
    this.controllerId = this.resources.get(
      ServoTestModalResources.controllerId,
    ) as number;
  }

  onSliderChange(_: unknown) {
    const evt = new ModalCallbackEvent(ServoTestModalResources.sendServoMove, {
      controllerId: this.controllerId,
      servoId: this.servoId,
      value: this.value,
    });
    this.modalCallback.emit(evt);
  }

  enableTest() {
    this.disableSlider = false;
  }

  override closeModal(): void {
    const evt = new ModalCallbackEvent(
      ServoTestModalResources.closeEvent,
      null,
    );
    this.modalCallback.emit(evt);
  }
}
