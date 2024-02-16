import { Component, Input, OnInit, ViewChild, ViewContainerRef } from '@angular/core';
import { MatExpansionPanel } from '@angular/material/expansion';
import { MatCheckboxModule } from '@angular/material/checkbox'
import { MatFormField } from '@angular/material/form-field';
import { ControlModule, ControllerLocation, KangarooController, UartChannel, UartModule, UartType } from 'astros-common';
import { KangarooModuleComponent } from '../uart-modules/kangaroo-module/kangaroo-module.component';
import { scheduled } from 'rxjs';

@Component({
  selector: 'app-esp-module',
  templateUrl: './esp-module.component.html',
  styleUrls: ['./esp-module.component.scss'],
  viewProviders: [MatExpansionPanel, MatFormField, MatCheckboxModule]
})
export class EspModuleComponent implements OnInit {

  @Input()
  module!: ControllerLocation;

  @ViewChild('uart1Container', { read: ViewContainerRef }) uart1Container!: ViewContainerRef;
  @ViewChild('uart2Container', { read: ViewContainerRef }) uart2Container!: ViewContainerRef;

  originalUart1Type!: UartType;
  originalUart1Module!: any;

  originalUart2Type!: UartType;
  originalUart2Module!: any;

  components: Array<any>;
  uart1Type: string;
  uart2Type: string;


  constructor() {
    this.components = new Array<any>();
    this.uart1Type = '0';
    this.uart2Type = '0';
  }

  ngOnInit(): void {
  }

  ngOnChanges() {
    if (this.originalUart1Type === undefined &&
      this.module !== undefined &&
      this.uart1Container !== undefined) {

      this.originalUart1Type = this.module.uartModule.channels[0].type;
      this.originalUart1Module = this.copyUartModule(this.module.uartModule.channels[0]);

      this.uart1Type = this.originalUart1Type.toString();
      this.setUartModuleForSlot(this.originalUart1Type, this.originalUart1Module, 1);
    }
    if (this.originalUart2Type === undefined &&
      this.module !== undefined &&
      this.uart2Container !== undefined) {

      this.originalUart2Type = this.module.uartModule.channels[1].type;
      this.originalUart2Module = this.copyUartModule(this.module.uartModule.channels[1]);

      this.uart2Type = this.originalUart2Type.toString();
      this.setUartModuleForSlot(this.originalUart2Type, this.originalUart2Module, 2);
    }
  }

  servoNameChange(id: number, $event: any) {
    this.module.servoModule.channels[id].channelName = $event;
  }

  servoStatusChange(id: number, $event: any) {
    this.module.servoModule.channels[id].enabled = $event;
  }

  uartTypeChange($event: any, channel: number) {

    const ut = +$event;

    if (channel == 1 && ut === this.originalUart1Type) {
      this.setUartModuleForSlot(this.originalUart1Type, this.originalUart1Module, 1);
    }
    else if (channel == 2 && ut === this.originalUart2Type) {
      this.setUartModuleForSlot(this.originalUart2Type, this.originalUart2Module, 2);
    }
    else {

      let module: any;
      switch (ut) {
        case UartType.kangaroo:
          module = new KangarooController();
          break;
        default:
          module = new Object();
          break;
      }

      this.setUartModuleForSlot(ut, module, channel);
    }
  }

  setUartModuleForSlot(uartType: UartType, module: any, channel: number) {
    switch (channel) {
      case 1:
        this.setUartModule(uartType, module, this.uart1Container, this.module.uartModule.channels[0]);
        break;
      case 2:
        this.setUartModule(uartType, module, this.uart2Container, this.module.uartModule.channels[1]);
        break;
    }
  }

  setUartModule(uartType: UartType, module: any, container: ViewContainerRef, uartChannel: UartChannel) {
    let component: any;

    container.clear()
    this.components.splice(0, this.components.length);

    switch (uartType) {
      case UartType.kangaroo:
        component = container.createComponent(KangarooModuleComponent);
        break;
    }

    uartChannel.type = uartType;
    uartChannel.module = module;

    if (component) {
      component.instance.module = module;

      this.components.push(component);
    }
  }

  moduleCallback(evt: any) {
    throw new Error('Method not implemented.');
  }

  copyUartModule(module: any): any {
    let temp: any;

    switch (module.type) {
      case UartType.kangaroo:
        temp = new KangarooController();
        temp.channelOneName = module.module.channelOneName;
        temp.channelTwoName = module.module.channelTwoName;
        break;
      default:
        temp = new Object();
        break;
    }

    return temp;
  }
}
