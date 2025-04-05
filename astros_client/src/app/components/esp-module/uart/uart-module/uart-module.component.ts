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
import { ModuleType, ModuleSubType, UartModule } from 'astros-common';
import { GenericSerialModuleComponent } from '../uart-submodules/generic-serial-module/generic-serial-module.component';
import { KangarooModuleComponent } from '../uart-submodules/kangaroo-module/kangaroo-module.component';
import { MaestroModuleComponent } from '../uart-submodules/maestro-module/maestro-module.component';
import { FormsModule } from '@angular/forms';
import { BaseUartSubModuleComponent } from '../uart-submodules/base-uart-sub-module/base-uart-sub-module.component';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { faTimes } from '@fortawesome/free-solid-svg-icons';
import { RemoveModuleEvent, ServoTestEvent } from '../../utility/module-events';
import { HcrSerialModuleComponent } from '../uart-submodules/hcr-serial-module/hcr-serial-module.component';

@Component({
  selector: 'app-uart-module',
  templateUrl: './uart-module.component.html',
  styleUrl: './uart-module.component.scss',
  imports: [
    MatExpansionPanel,
    MatExpansionPanelHeader,
    MatExpansionPanelTitle,
    MatExpansionPanelDescription,
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

  @Input()
  parentTestId!: string;

  @Output()
  removeModuleEvent = new EventEmitter<RemoveModuleEvent>();

  @Output()
  servoTestEvent = new EventEmitter<ServoTestEvent>();

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
    switch (this.module.moduleSubType) {
      case ModuleSubType.genericSerial:
        this.subtypeName = 'Generic Serial';
        break;
      case ModuleSubType.kangaroo:
        this.subtypeName = 'Kangaroo X2';
        break;
      case ModuleSubType.humanCyborgRelationsSerial:
        this.subtypeName = 'HCR';
        break;
      case ModuleSubType.maestro:
        this.subtypeName = 'Pololu Maestro';
        break;
      default:
        break;
    }
  }

  setModule() {
    this.uartContainer?.clear();

    let component!: ComponentRef<BaseUartSubModuleComponent>;

    switch (this.module.moduleSubType) {
      case ModuleSubType.humanCyborgRelationsSerial:
        component = this.uartContainer.createComponent(
          HcrSerialModuleComponent,
        ) as ComponentRef<HcrSerialModuleComponent>;
        break;
      case ModuleSubType.genericSerial:
        component = this.uartContainer.createComponent(
          GenericSerialModuleComponent,
        ) as ComponentRef<GenericSerialModuleComponent>;
        break;
      case ModuleSubType.kangaroo:
        component = this.uartContainer.createComponent(
          KangarooModuleComponent,
        ) as ComponentRef<KangarooModuleComponent>;
        break;
      case ModuleSubType.maestro:
        {
          component = this.uartContainer.createComponent(
            MaestroModuleComponent,
          ) as ComponentRef<MaestroModuleComponent>;

          component.instance.servoTestEvent.subscribe(
            (evt: ServoTestEvent) => {this.onServoTestEvent(evt);})
          break;
        }
      default:
        break;
    }

    if (component) {
      component.instance.parentTestId = this.parentTestId;
      component.instance.module = this.module;
      component.instance.isMaster = this.isMaster;
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

  onServoTestEvent(evt: ServoTestEvent): void {
    this.servoTestEvent.emit(evt);
  }
}
