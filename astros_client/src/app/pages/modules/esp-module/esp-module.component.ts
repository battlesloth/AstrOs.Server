import { Component, Input, OnChanges, OnInit, SimpleChanges, ViewChild, ViewContainerRef } from '@angular/core';
import { MatExpansionPanel } from '@angular/material/expansion';
import { MatCheckboxModule } from '@angular/material/checkbox'
import { MatFormField } from '@angular/material/form-field';
import { ControlModule, ControllerLocation, KangarooController, UartChannel, UartModule, UartType } from 'astros-common';
import { KangarooModuleComponent } from '../uart-modules/kangaroo-module/kangaroo-module.component';


@Component({
  selector: 'app-esp-module',
  templateUrl: './esp-module.component.html',
  styleUrls: ['./esp-module.component.scss'],
  viewProviders: [MatExpansionPanel, MatFormField, MatCheckboxModule]
})
export class EspModuleComponent implements OnInit {

  @Input()
  isMaster: boolean = false;

  @Input()
  get module(): any { return this._module; }
  set module(value: any) {
    this._module = value;
    this.setModule();
  }
  _module!: ControllerLocation;


  @ViewChild('uart1Container', { read: ViewContainerRef })
  get uart1Container(): ViewContainerRef { return this._uart1Container; }
  set uart1Container(value: ViewContainerRef) {
    this._uart1Container = value;
    this.setUartModuleForSlot(this.originalUart1Type, this.originalUart1Module, 1);
  }
  _uart1Container!: ViewContainerRef;

  @ViewChild('uart2Container', { read: ViewContainerRef })
  get uart2Container(): ViewContainerRef { return this._uart2Container; }
  set uart2Container(value: ViewContainerRef) {
    this._uart2Container = value;
    this.setUartModuleForSlot(this.originalUart2Type, this.originalUart2Module, 2);
  }
  _uart2Container!: ViewContainerRef;

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

  setModule() {
    this.originalUart1Type = this.module.uartModule.channels[0].type;
    this.originalUart1Module = this.copyUartModule(this.module.uartModule.channels[0]);

    this.uart1Type = this.originalUart1Type.toString();

    this.originalUart2Type = this.module.uartModule.channels[1].type;
    this.originalUart2Module = this.copyUartModule(this.module.uartModule.channels[1]);

    this.uart2Type = this.originalUart2Type.toString();
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
