import { Component, OnInit } from '@angular/core';
import { BaseEventModalComponent } from '../../scripting/base-event-modal/base-event-modal.component';
import { MatSlider, MatSliderThumb } from '@angular/material/slider';
import { FormsModule } from '@angular/forms';
import { ModalCallbackEvent } from '../../modal-base/modal-callback-event';
import { ModuleSubType } from 'astros-common';

export class ServoTestModalResources {
  public static controllerAddress = 'controllerAddress';
  public static controllerName = 'controllerName';
  public static moduleSubType = 'moduleSubType';
  public static moduleIdx = 'moduleIdx';
  public static channelNumber = 'channelNumber';
  public static sendServoMove = 'servoTesst_servoMove';
  public static closeEvent = 'servoTest_closeEvent';
}

@Component({
  selector: 'app-servo-test-modal',
  templateUrl: './servo-test-modal.component.html',
  styleUrl: './servo-test-modal.component.scss',
  imports: [MatSlider, MatSliderThumb, FormsModule],
})
export class ServoTestModalComponent
  extends BaseEventModalComponent
  implements OnInit
{
  controllerAddress = '';
  controllerName = '';
  moduleSubType = ModuleSubType.none;
  moduleIdx = 0;
  channelNumber = 0;
  disableSlider = true;
  value = 1500;

  constructor() {
    super();
  }

  ngOnInit(): void {
    this.controllerAddress = this.resources.get(
      ServoTestModalResources.controllerAddress,
    ) as string;
    this.controllerName = this.resources.get(
      ServoTestModalResources.controllerName,
    ) as string;
    this.moduleSubType = this.resources.get(
      ServoTestModalResources.moduleSubType,
    ) as ModuleSubType;
    this.moduleIdx = this.resources.get(
      ServoTestModalResources.moduleIdx,
    ) as number;
    this.channelNumber = this.resources.get(
      ServoTestModalResources.channelNumber,
    ) as number;
  }

  onSliderChange(_: unknown) {
    const evt = new ModalCallbackEvent(ServoTestModalResources.sendServoMove, {
      controllerAddress: this.controllerAddress,
      controllerName: this.controllerName,
      moduleSubType: this.moduleSubType,
      moduleIdx: this.moduleIdx,
      channelNumber: this.channelNumber,
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
