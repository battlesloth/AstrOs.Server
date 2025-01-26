import { Component, Input, OnInit } from '@angular/core';
import { UartModule } from 'astros-common';

@Component({
  selector: 'app-base-uart-sub-module',
  template: '',
  styleUrls: ['./base-uart-sub-module.component.scss'],
})
export abstract class BaseUartSubModuleComponent implements OnInit {
  @Input()
  isMaster = false;

  @Input()
  module!: UartModule;

  uartChannel!: string;
  baudRate!: string;

  abstract ngOnInit(): void;

  onChannelChange(val: string) {
    this.module.uartChannel = parseInt(val);
  }

  onBaudRateChange(val: string) {
    this.module.baudRate = parseInt(val);
  }
}
