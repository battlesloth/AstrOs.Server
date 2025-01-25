import { Component, OnInit } from '@angular/core';
import { ModalBaseComponent } from '../../modal-base/modal-base.component';
import { ModuleType } from 'astros-common/dist/astros_enums';
import { ModuleSubType } from 'astros-common/dist/astros_enums';
import { NgForOf } from '@angular/common';
import { ModalCallbackEvent } from '../../modal-base/modal-callback-event';

export class AddModuleModalResources {
  public static moduleType = 'moduleType';
  public static closeEvent = 'add_module_closeEvent';
}

export interface AddModuleModalResponse {
  moduleType: ModuleType;
  moduleSubType: ModuleSubType;
}

export interface ModuleSubTypeSelection {
  id: ModuleSubType;
  value: string;
}

@Component({
  selector: 'app-add-module-modal',
  imports: [NgForOf],
  templateUrl: './add-module-modal.component.html',
  styleUrl: './add-module-modal.component.scss',
})
export class AddModuleModalComponent
  extends ModalBaseComponent
  implements OnInit
{
  options: ModuleSubTypeSelection[] = [];

  moduleType: ModuleType = ModuleType.none;
  selectedSubType: ModuleSubType = ModuleSubType.none;

  moduleTypes: Map<ModuleType, string>;

  moduleSubTypes: Map<ModuleType, ModuleSubTypeSelection[]>;

  constructor() {
    super();

    this.moduleTypes = new Map<ModuleType, string>([
      [ModuleType.uart, 'Serial'],
      [ModuleType.i2c, 'I2C'],
      [ModuleType.gpio, 'GPIO'],
    ]);

    this.moduleSubTypes = new Map<ModuleType, ModuleSubTypeSelection[]>([
      [
        ModuleType.uart,
        [
          { id: ModuleSubType.genericSerial, value: 'Generic' },
          {
            id: ModuleSubType.humanCyborgRelationsSerial,
            value: 'Human Cyborg Relations',
          },
          { id: ModuleSubType.kangaroo, value: 'Kangaroo' },
          { id: ModuleSubType.maestro, value: 'Maestro' },
        ],
      ],
      [
        ModuleType.i2c,
        [
          { id: ModuleSubType.genericI2C, value: 'Generic' },
          {
            id: ModuleSubType.humanCyborgRelationsI2C,
            value: 'Human Cyborg Relations',
          },
          { id: ModuleSubType.pwmBoard, value: 'PWM Board' },
        ],
      ],
    ]);
  }

  ngOnInit(): void {
    this.moduleType = this.resources.get(
      AddModuleModalResources.moduleType,
    ) as ModuleType;

    if (this.moduleSubTypes.has(this.moduleType)) {
      this.options = this.moduleSubTypes.get(
        this.moduleType,
      ) as ModuleSubTypeSelection[];
    }
  }

  modalChange($event: Event) {
    this.selectedSubType = +($event.target as HTMLInputElement).value;
  }

  addModule() {
    const evt = new ModalCallbackEvent(AddModuleModalResources.closeEvent, {
      moduleType: this.moduleType,
      moduleSubType: this.selectedSubType,
    });
    this.modalCallback.emit(evt);
  }
}
