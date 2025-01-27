import { Component, EventEmitter, Input, Output } from '@angular/core';
import {
  MatExpansionPanel,
  MatAccordion,
  MatExpansionPanelHeader,
  MatExpansionPanelTitle,
  MatExpansionPanelDescription,
} from '@angular/material/expansion';
import { MatCheckbox } from '@angular/material/checkbox';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { ControllerLocation, ModuleSubType, ModuleType } from 'astros-common';
import { UartModuleComponent } from '../uart/uart-module/uart-module.component';
import { NgIf, NgFor } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { faPlus } from '@fortawesome/free-solid-svg-icons';
import { I2cModuleComponent } from '../i2c/i2c-module/i2c-module.component';
import {
  AddModuleEvent,
  RemoveModuleEvent,
  ServoTestEvent,
} from '../utility/module-events';

@Component({
  selector: 'app-esp-module',
  templateUrl: './esp-module.component.html',
  styleUrls: ['./esp-module.component.scss'],
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
    I2cModuleComponent,
    FontAwesomeModule,
  ],
})
export class EspModuleComponent {
  @Output()
  removeModuleEvent = new EventEmitter<RemoveModuleEvent>();

  @Output()
  addModuleEvent = new EventEmitter<AddModuleEvent>();

  @Output()
  openServoTestModal = new EventEmitter<ServoTestEvent>();

  @Input()
  isMaster = false;

  @Input()
  location!: ControllerLocation;

  addIcon = faPlus;

  uartPanelOpenState = false;

  moduleCallback(_: unknown) {
    throw new Error('Method not implemented.');
  }

  addUartModule(evt: Event) {
    evt.stopPropagation();

    if (!this.uartPanelOpenState) {
      this.uartPanelOpenState = true;
    }

    this.addModuleEvent.emit({
      locationId: this.location.locationId,
      module: ModuleType.uart,
    });
  }

  addI2cModule(evt: Event) {
    evt.stopPropagation();

    this.addModuleEvent.emit({
      locationId: this.location.locationId,
      module: ModuleType.i2c,
    });
  }

  removeModule(evt: RemoveModuleEvent) {
    this.removeModuleEvent.emit({
      locationId: this.location.locationId,
      id: evt.id,
      module: evt.module,
    });
  }

  testServoModal(
    module: ModuleType,
    subType: ModuleSubType,
    channelId: string,
  ) {
    this.openServoTestModal.emit({
      locationId: this.location.locationId,
      moduleType: module,
      moduleSubType: subType,
      channelId: channelId,
    });
  }
}
