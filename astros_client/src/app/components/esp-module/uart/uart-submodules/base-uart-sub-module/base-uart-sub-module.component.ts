import { Component, Input, OnInit } from '@angular/core';
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

  uartChannel!: string;
  baudRate!: string;

  onChannelChange(val: string) {
    this.module.uartChannel = parseInt(val);
  }

  onBaudRateChange(val: string) {
    this.module.baudRate = parseInt(val);
  }
}
