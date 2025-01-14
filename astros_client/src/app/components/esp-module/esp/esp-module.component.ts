import {
  Component,
  EventEmitter,
  Input,
  Output,
  ViewChild,
  ViewContainerRef,
} from '@angular/core';
import {
  MatExpansionPanel,
  MatAccordion,
  MatExpansionPanelHeader,
  MatExpansionPanelTitle,
  MatExpansionPanelDescription,
} from '@angular/material/expansion';
import { MatCheckboxModule, MatCheckbox } from '@angular/material/checkbox';
import { MatFormField } from '@angular/material/form-field';
import { ControllerLocation, UartModule, UartType } from 'astros-common';
import { KangarooModuleComponent } from '../uart/uart-submodules/kangaroo-module/kangaroo-module.component';
import { UartModuleComponent } from '../uart/uart-module/uart-module.component';
import { NgIf, NgFor } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-esp-module',
  templateUrl: './esp-module.component.html',
  styleUrls: ['./esp-module.component.scss'],
  //viewProviders: [MatFormField, MatCheckboxModule],
  standalone: true,
  imports: [
    MatAccordion,
    MatExpansionPanel,
    MatExpansionPanelHeader,
    MatExpansionPanelTitle,
    NgIf,
    FormsModule,
    MatExpansionPanelDescription,
    NgFor,
    MatCheckbox,
    UartModuleComponent,
  ],
})
export class EspModuleComponent {
  @Output() openServoTestModal = new EventEmitter<any>();

  @Input()
  isMaster = false;

  @Input()
  locationId = 0;

  @Input()
  get module(): any {
    return this._module;
  }
  set module(value: any) {
    this._module = value;
    this.setModule();
  }
  _module!: ControllerLocation;
  uartPanelOpenState = false;

  @ViewChild('uart1Container', { read: ViewContainerRef })
  get uart1Container(): ViewContainerRef {
    return this._uart1Container;
  }
  set uart1Container(value: ViewContainerRef) {
    this._uart1Container = value;
    //this.setUartModuleForSlot(this.originalUart1Type, this.originalUart1Module, 1);
  }
  _uart1Container!: ViewContainerRef;

  @ViewChild('uart2Container', { read: ViewContainerRef })
  get uart2Container(): ViewContainerRef {
    return this._uart2Container;
  }
  set uart2Container(value: ViewContainerRef) {
    this._uart2Container = value;
    //this.setUartModuleForSlot(this.originalUart2Type, this.originalUart2Module, 2);
  }
  _uart2Container!: ViewContainerRef;

  originalUart1Type!: UartType;
  originalUart1Module!: any;

  originalUart2Type!: UartType;
  originalUart2Module!: any;

  components: any[];
  uart1Type: string;
  uart2Type: string;

  constructor() {
    this.components = new Array<any>();
    this.uart1Type = '0';
    this.uart2Type = '0';
  }

  setModule() {
    /*this.originalUart1Type = this.module.uartModule.channels[0].type;
    this.originalUart1Module = this.copyUartModule(this.module.uartModule.channels[0]);

    this.uart1Type = this.originalUart1Type.toString();

    this.originalUart2Type = this.module.uartModule.channels[1].type;
    this.originalUart2Module = this.copyUartModule(this.module.uartModule.channels[1]);

    this.uart2Type = this.originalUart2Type.toString();
    */
  }

  servoNameChange(id: number, $event: any) {
    this.module.servoModule.channels[id].channelName = $event;
  }

  servoStatusChange(id: number, $event: any) {
    this.module.servoModule.channels[id].enabled = $event;
  }

  uartTypeChange($event: any, channel: number) {
    return;

    const ut = +$event;

    if (channel === 1 && ut === this.originalUart1Type) {
      this.setUartModuleForSlot(
        this.originalUart1Type,
        this.originalUart1Module,
        1,
      );
    } else if (channel === 2 && ut === this.originalUart2Type) {
      this.setUartModuleForSlot(
        this.originalUart2Type,
        this.originalUart2Module,
        2,
      );
    } else {
      let module: any;
      switch (ut) {
        /*case UartType.kangaroo:
          module = new KangarooX2();
          break;
        */
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
        this.setUartModule(
          uartType,
          module,
          this.uart1Container,
          this.module.uartModule.channels[0],
        );
        break;
      case 2:
        this.setUartModule(
          uartType,
          module,
          this.uart2Container,
          this.module.uartModule.channels[1],
        );
        break;
    }
  }

  setUartModule(
    uartType: UartType,
    module: any,
    container: ViewContainerRef,
    uartModule: UartModule,
  ) {
    let component: any;

    container.clear();
    this.components.splice(0, this.components.length);

    switch (uartType) {
      case UartType.kangaroo:
        component = container.createComponent(KangarooModuleComponent);
        break;
    }

    uartModule.uartType = uartType;
    uartModule.subModule = module;

    if (component) {
      component.instance.module = module;

      this.components.push(component);
    }
  }

  moduleCallback(_: unknown) {
    throw new Error('Method not implemented.');
  }

  addUartModule(evt: any) {
    evt.stopPropagation();

    if (!this.uartPanelOpenState) {
      this.uartPanelOpenState = true;
    }

    this.module.uartModules.push(
      new UartModule(
        crypto.randomUUID(),
        this.module.locationId,
        UartType.genericSerial,
        1,
        9600,
        'New Serial Module',
      ),
    );
  }

  copyUartModule(module: any): any {
    let temp: any;

    switch (module.type) {
      /*case UartType.kangaroo:
        temp = new KangarooController();
        temp.channelOneName = module.module.channelOneName;
        temp.channelTwoName = module.module.channelTwoName;
        break/*/
      default:
        temp = new Object();
        break;
    }

    return temp;
  }

  testServoModal(channelId: number) {
    this.openServoTestModal.emit({
      controllerId: this.module.controller.id,
      channelId,
    });
  }
}
