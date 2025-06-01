import { Component, EventEmitter, Input, Output } from '@angular/core';
import { ServoTestEvent } from '@src/components/esp-module/utility/module-events';
import { UartModule } from 'astros-common';

@Component({
  selector: 'app-base-uart-sub-module',
  template: '',
  styleUrls: ['./base-uart-sub-module.component.scss'],
})
export abstract class BaseUartSubModuleComponent {
  @Input()
  isMaster = false;

  @Input()
  module!: UartModule;

  @Input()
  parentTestId!: string;

  @Output()
  servoTestEvent = new EventEmitter<ServoTestEvent>();

  uartChannel!: string;
  baudRate!: string;

  onChannelChange(val: string) {
    this.module.uartChannel = parseInt(val);
  }

  onBaudRateChange(val: string) {
    this.module.baudRate = parseInt(val);
  }
}
