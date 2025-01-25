import { NgIf } from '@angular/common';
import {
  AfterViewInit,
  Component,
  ComponentRef,
  Input,
  ViewChild,
  ViewContainerRef,
} from '@angular/core';
import {
  MatExpansionPanel,
  MatExpansionPanelHeader,
  MatExpansionPanelTitle,
} from '@angular/material/expansion';
import { UartModule, UartType } from 'astros-common';
import { GenericSerialModuleComponent } from '../uart-submodules/generic-serial-module/generic-serial-module.component';
import { KangarooModuleComponent } from '../uart-submodules/kangaroo-module/kangaroo-module.component';
import { MaestroModuleComponent } from '../uart-submodules/maestro-module/maestro-module.component';
import { FormsModule } from '@angular/forms';
import { BaseUartSubModuleComponent } from '../uart-submodules/base-uart-sub-module/base-uart-sub-module.component';


@Component({
  selector: 'app-uart-module',
  templateUrl: './uart-module.component.html',
  styleUrl: './uart-module.component.scss',
  imports: [
    MatExpansionPanel,
    MatExpansionPanelHeader,
    MatExpansionPanelTitle,
    NgIf,
    GenericSerialModuleComponent,
    KangarooModuleComponent,
    MaestroModuleComponent,
    FormsModule,
  ],
})
export class UartModuleComponent implements AfterViewInit {
  @ViewChild('uartContainer', { read: ViewContainerRef })
  uartContainer!: ViewContainerRef;

  @Input()
  isMaster = false;

  @Input()
  module!: UartModule;

  component!: ComponentRef<any>;

  nameClicked(evt: MouseEvent) {
    evt.stopPropagation();
  }

  ngAfterViewInit(): void {
    this.setModule();
  }

  setModule() {
    this.uartContainer?.clear();

    let component: ComponentRef<BaseUartSubModuleComponent>;

    switch (this.module.uartType) {
      case UartType.genericSerial:
        {
        component = this.uartContainer.createComponent(
          GenericSerialModuleComponent,
        ) as ComponentRef<GenericSerialModuleComponent>;
        component.instance.module = this.module;
        component.instance.isMaster = this.isMaster;
        break;
      }
      case UartType.kangaroo:
       { component = this.uartContainer.createComponent(
          KangarooModuleComponent,
        ) as ComponentRef<KangarooModuleComponent>;
        component.instance.module = this.module;
        component.instance.isMaster = this.isMaster; 
        break;}
      case UartType.maestro:
        {
        component = this.uartContainer.createComponent(
          MaestroModuleComponent,
        ) as ComponentRef<MaestroModuleComponent>;
        component.instance.module = this.module;
        component.instance.isMaster = this.isMaster;
        break;
      }
      default:
        break;
    }
  }
}
