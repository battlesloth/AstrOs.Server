import { NgIf } from '@angular/common';
import {
  AfterContentInit,
  AfterViewInit,
  Component,
  ComponentRef,
  EventEmitter,
  Input,
  Output,
  ViewChild,
  ViewContainerRef,
} from '@angular/core';
import {
  MatExpansionPanel,
  MatExpansionPanelDescription,
  MatExpansionPanelHeader,
  MatExpansionPanelTitle,
} from '@angular/material/expansion';
import { ModuleType, UartModule, UartType } from 'astros-common';
import { GenericSerialModuleComponent } from '../uart-submodules/generic-serial-module/generic-serial-module.component';
import { KangarooModuleComponent } from '../uart-submodules/kangaroo-module/kangaroo-module.component';
import { MaestroModuleComponent } from '../uart-submodules/maestro-module/maestro-module.component';
import { FormsModule } from '@angular/forms';
import { BaseUartSubModuleComponent } from '../uart-submodules/base-uart-sub-module/base-uart-sub-module.component';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { faTimes } from '@fortawesome/free-solid-svg-icons';
import { RemoveModuleEvent } from '../../utility/module-events';

@Component({
  selector: 'app-uart-module',
  templateUrl: './uart-module.component.html',
  styleUrl: './uart-module.component.scss',
  imports: [
    MatExpansionPanel,
    MatExpansionPanelHeader,
    MatExpansionPanelTitle,
    MatExpansionPanelDescription,
    NgIf,
    GenericSerialModuleComponent,
    KangarooModuleComponent,
    MaestroModuleComponent,
    FormsModule,
    FontAwesomeModule,
  ],
})
export class UartModuleComponent implements AfterViewInit, AfterContentInit {
  @ViewChild('uartContainer', { read: ViewContainerRef })
  uartContainer!: ViewContainerRef;

  @Input()
  isMaster = false;

  @Input()
  module!: UartModule;

  @Output()
  removeModuleEvent = new EventEmitter<RemoveModuleEvent>();

  subtypeName = '';
  removeIcon = faTimes;
  component!: ComponentRef<unknown>;

  nameClicked(evt: MouseEvent) {
    evt.stopPropagation();
  }

  ngAfterViewInit(): void {
    this.setModule();
  }

  ngAfterContentInit(): void {
    switch (this.module.uartType) {
      case UartType.genericSerial:
        this.subtypeName = 'Generic Serial';
        break;
      case UartType.kangaroo:
        this.subtypeName = 'Kangaroo X2';
        break;
      case UartType.maestro:
        this.subtypeName = 'Pololu Maestro';
        break;
      default:
        break;
    }
  }

  setModule() {
    this.uartContainer?.clear();

    let component: ComponentRef<BaseUartSubModuleComponent>;

    switch (this.module.uartType) {
      case UartType.genericSerial: {
        component = this.uartContainer.createComponent(
          GenericSerialModuleComponent,
        ) as ComponentRef<GenericSerialModuleComponent>;
        component.instance.module = this.module;
        component.instance.isMaster = this.isMaster;
        break;
      }
      case UartType.kangaroo: {
        component = this.uartContainer.createComponent(
          KangarooModuleComponent,
        ) as ComponentRef<KangarooModuleComponent>;
        component.instance.module = this.module;
        component.instance.isMaster = this.isMaster;
        break;
      }
      case UartType.maestro: {
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

  removeModule(event: Event) {
    event.stopPropagation();
    this.removeModuleEvent.emit({
      locationId: this.module.locationId,
      id: this.module.id,
      module: ModuleType.uart,
    });
  }
}
