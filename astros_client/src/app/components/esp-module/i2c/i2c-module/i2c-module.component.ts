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
import { 
  I2cModule, 
  ModuleType, 
  ModuleSubType 
} from 'astros-common';
import { RemoveModuleEvent } from '../../utility/module-events';
import { GenericI2cModuleComponent } from '../i2c-submodules/generic-i2c-module/generic-i2c-module.component';
import { Pca9685ModuleComponent } from '../i2c-submodules/pca9685-module/pca9685-module.component';
import { BaseI2cSubModuleComponent } from '../i2c-submodules/base-i2c-sub-module/base-i2c-sub-module.component';

export interface AddressChangeEvent {
  old: number;
  new: number;
} 

@Component({
  selector: 'app-i2c-module',
  imports: [
    MatExpansionPanel,
    MatExpansionPanelHeader,
    MatExpansionPanelTitle,
    MatExpansionPanelDescription,
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
  module!: I2cModule;

  // here to trigger change detection for object property changes
  @Input()
  set updateTrigger(val: number) {
    console.log('I2C Module Update Trigger: ', val);
    this.setModule();
   }
  
  @Output()
  removeModuleEvent = new EventEmitter<RemoveModuleEvent>();

  @Output()
  i2cAddressChangedEvent = new EventEmitter<AddressChangeEvent>();

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
      case ModuleSubType.genericI2C:
        this.subtypeName = 'Generic I2C';
        break;
      case ModuleSubType.humanCyborgRelationsI2C:
        this.subtypeName = 'Human Cyborg Relations';
        break;
      case ModuleSubType.pwmBoard:
        this.subtypeName = 'PCA9685 PWM Board';
        break;
      default:
        break;
    }
  }

  setModule() {
    this.i2cContainer?.clear();

    let component!: ComponentRef<BaseI2cSubModuleComponent>;

    switch (this.module.moduleSubType) {
      case ModuleSubType.genericI2C:

        component = this.i2cContainer.createComponent(
          GenericI2cModuleComponent,
        ) as ComponentRef<GenericI2cModuleComponent>;
        break;
      case ModuleSubType.humanCyborgRelationsI2C:
      case ModuleSubType.pwmBoard:
        component = this.i2cContainer.createComponent(
          Pca9685ModuleComponent
        ) as ComponentRef<Pca9685ModuleComponent>;
        break;
      default:
        break;
    }

    if (component) {
      component.instance.module = this.module;
      component.instance.i2cAddressChangedEvent.subscribe((val: string) => {

        console.log('I2C Address Changed: ', val);

        this.i2cAddressChangedEvent.emit({
          old: this.module.i2cAddress,
          new: parseInt(val, 10),
        });
      });
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
