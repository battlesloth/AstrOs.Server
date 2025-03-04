import { AfterContentInit, Component } from '@angular/core';
import { ModalBaseComponent } from '../../modal-base/modal-base.component';
import { ModuleType } from 'astros-common/dist/astros_enums';
import { ModuleSubType } from 'astros-common/dist/astros_enums';
import { NgForOf } from '@angular/common';
import { ModalCallbackEvent } from '../../modal-base/modal-callback-event';
import { FormsModule } from '@angular/forms';

export class AddModuleModalResources {
  public static moduleType = 'moduleType';
  public static locationId = 'locationId';
  public static addEvent = 'add_module_addEvent';
  public static closeEvent = 'add_module_closeEvent';
}

export interface AddModuleModalResponse {
  locationId: string;
  moduleType: ModuleType;
  moduleSubType: ModuleSubType;
}

export interface ModuleSubTypeSelection {
  id: ModuleSubType;
  value: string;
}

@Component({
  selector: 'app-add-module-modal',
  imports: [NgForOf, FormsModule],
  templateUrl: './add-module-modal.component.html',
  styleUrl: './add-module-modal.component.scss',
})
export class AddModuleModalComponent
  extends ModalBaseComponent
  implements AfterContentInit
{
  options: ModuleSubTypeSelection[] = [];

  locationId = '0';
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

  ngAfterContentInit(): void {
    this.locationId = this.resources.get(
      AddModuleModalResources.locationId,
    ) as string;

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
    const evt = new ModalCallbackEvent(AddModuleModalResources.addEvent, {
      locationId: this.locationId,
      moduleType: this.moduleType,
      moduleSubType: this.selectedSubType,
    });
    this.modalCallback.emit(evt);
  }

  closeModal() {
    const evt = new ModalCallbackEvent(AddModuleModalResources.closeEvent, {});
    this.modalCallback.emit(evt);
  }
}
