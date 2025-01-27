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
import { FormsModule } from '@angular/forms';
import {
  MatExpansionPanel,
  MatExpansionPanelDescription,
  MatExpansionPanelHeader,
  MatExpansionPanelTitle,
} from '@angular/material/expansion';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { faTimes } from '@fortawesome/free-solid-svg-icons';
import { I2cModule, I2cType, ModuleType } from 'astros-common';
import { RemoveModuleEvent } from '../../utility/module-events';

@Component({
  selector: 'app-i2c-module',
  imports: [
    MatExpansionPanel,
    MatExpansionPanelHeader,
    MatExpansionPanelTitle,
    MatExpansionPanelDescription,
    NgIf,
    FormsModule,
    FontAwesomeModule,
  ],
  templateUrl: './i2c-module.component.html',
  styleUrl: './i2c-module.component.scss',
})
export class I2cModuleComponent implements AfterViewInit, AfterContentInit {
  @ViewChild('i2cContainer', { read: ViewContainerRef })
  i2cContainer!: ViewContainerRef;

  @Input()
  isMaster = false;

  @Input()
  module!: I2cModule;

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
    switch (this.module.type) {
      case I2cType.genericI2C:
        this.subtypeName = 'Generic I2C';
        break;
      case I2cType.humanCyborgRelations:
        this.subtypeName = 'Human Cyborg Relations';
        break;
      case I2cType.pwmBoard:
        this.subtypeName = 'PCA9685 PWM Board';
        break;
      default:
        break;
    }
  }

  setModule() {
    this.i2cContainer?.clear();

    switch (this.module.type) {
      case I2cType.genericI2C:
        break;
      case I2cType.humanCyborgRelations:
        break;
      case I2cType.pwmBoard:
        break;
      default:
        break;
    }
  }

  removeModule(event: Event) {
    event.stopPropagation();
    this.removeModuleEvent.emit({
      locationId: this.module.locationId,
      id: this.module.id,
      module: ModuleType.i2c,
    });
  }
}
