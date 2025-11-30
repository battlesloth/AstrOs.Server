import { Component, EventEmitter, Input, Output } from '@angular/core';
import {
  MatExpansionPanel,
  MatAccordion,
  MatExpansionPanelHeader,
  MatExpansionPanelTitle,
  MatExpansionPanelDescription,
} from '@angular/material/expansion';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { ControllerLocation, ModuleType } from 'astros-common';
import { UartModuleComponent } from '../uart/uart-module/uart-module.component';

import { FormsModule } from '@angular/forms';
import { faPlus } from '@fortawesome/free-solid-svg-icons';
import {
  I2cModuleComponent,
  AddressChangeEvent,
} from '../i2c/i2c-module/i2c-module.component';
import {
  AddModuleEvent,
  RemoveModuleEvent,
  ServoTestEvent,
} from '../utility/module-events';
import { GpioChannelComponent } from '../gpio/gpio-channel/gpio-channel.component';

@Component({
  selector: 'app-esp-module',
  templateUrl: './esp-module.component.html',
  styleUrls: ['./esp-module.component.scss'],
  imports: [
    MatAccordion,
    MatExpansionPanel,
    MatExpansionPanelHeader,
    MatExpansionPanelTitle,
    FormsModule,
    MatExpansionPanelDescription,
    UartModuleComponent,
    I2cModuleComponent,
    GpioChannelComponent,
    FontAwesomeModule
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

  @Input()
  parentTestId!: string;

  addIcon = faPlus;

  uartPanelOpenState = false;
  i2cPanelOpenState = false;
  i2cUpdateTrigger = 0;

  moduleCallback(_: unknown) {
    throw new Error('Method not implemented.');
  }

  addUartModule(evt: Event) {
    evt.stopPropagation();

    if (!this.uartPanelOpenState) {
      this.uartPanelOpenState = true;
    }

    this.addModuleEvent.emit({
      locationId: this.location.id,
      module: ModuleType.uart,
    });
  }

  addI2cModule(evt: Event) {
    evt.stopPropagation();

    if (!this.i2cPanelOpenState) {
      this.i2cPanelOpenState = true;
    }

    this.addModuleEvent.emit({
      locationId: this.location.id,
      module: ModuleType.i2c,
    });
  }

  removeModule(evt: RemoveModuleEvent) {
    this.removeModuleEvent.emit({
      locationId: this.location.id,
      id: evt.id,
      module: evt.module,
    });
  }

  i2cAddressChanged(evt: AddressChangeEvent) {
    // if the new address in use, swap it to the old address
    const m1 = this.location.i2cModules.find((m) => m.i2cAddress === evt.new);

    if (m1) {
      m1.i2cAddress = evt.old;
    }

    const m2 = this.location.i2cModules.find((m) => m.i2cAddress === evt.old);

    if (m2) {
      m2.i2cAddress = evt.new;
    }

    this.i2cUpdateTrigger++;
  }

  onServoTestEvent(evt: ServoTestEvent) {
    evt.controllerAddress = this.location.controller.address;
    evt.controllerName = this.location.controller.name;
    this.openServoTestModal.emit(evt);
  }
}
