import { AfterViewInit, Component, Input } from '@angular/core';
import { UartModule } from 'astros-common';

@Component({
  selector: 'app-base-uart-sub-module',
  template: '',
  styleUrls: ['./base-uart-sub-module.component.scss'],
})
export abstract class BaseUartSubModuleComponent
implements AfterViewInit {
  @Input()
  isMaster = false;

  @Input()
  module!: UartModule;

  uartChannel!: string;
  baudRate!: string;

  abstract ngAfterViewInit(): void;

  onChannelChange(evt: Event) {
    this.module.uartChannel = parseInt(this.uartChannel);
  }

  onBaudRateChange(evt: Event) {
    this.module.baudRate = parseInt(this.baudRate);
  }
}
