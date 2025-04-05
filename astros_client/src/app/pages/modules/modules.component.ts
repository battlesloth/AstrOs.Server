import {
  AfterViewInit,
  Component,
  ElementRef,
  Renderer2,
  ViewChild,
  ViewContainerRef,
} from '@angular/core';
import {
  MatExpansionPanel,
  MatAccordion,
  MatExpansionPanelHeader,
  MatExpansionPanelTitle,
} from '@angular/material/expansion';
import {
  ControlModule,
  ControllerStatus,
  AstrOsLocationCollection,
  ControllerLocation,
  ModuleType,
  ModuleSubType,
  UartModule,
  HumanCyborgRelationsModule,
  KangarooX2,
  MaestroModule,
  I2cModule,
  AstrOsConstants,
  MaestroBoard,
  MaestroChannel,
} from 'astros-common';
import { faExclamationTriangle } from '@fortawesome/free-solid-svg-icons';
import {
  AlertModalComponent,
  AlertModalResources,
  ConfirmModalComponent,
  ConfirmModalResources,
  ModalComponent,
} from '@src/components/modals';
import { ModalCallbackEvent } from '../../components/modals/modal-base/modal-callback-event';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { NgIf, NgFor } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  AddModuleEvent,
  RemoveModuleEvent,
  ServoTestEvent,
} from '@src/components/esp-module/utility/module-events';
import { EspModuleComponent } from '@src/components/esp-module';
import {
  ControllerService,
  ModalService,
  SnackbarService,
  StatusService,
  WebsocketService,
} from '@src/services';
import {
  AddModuleModalComponent,
  AddModuleModalResources,
  LoadingModalComponent,
  LoadingModalResources,
  LoadingModalResponse,
  ServoTestModalComponent,
  ServoTestModalResources,
  AddModuleModalResponse,
} from '@src/components/modals/modules';
import { ActivatedRoute } from '@angular/router';

interface Caption {
  str: string;
}

@Component({
  selector: 'app-modules',
  templateUrl: './modules.component.html',
  styleUrls: ['./modules.component.scss'],
  viewProviders: [MatExpansionPanel],
  imports: [
    MatAccordion,
    MatExpansionPanel,
    MatExpansionPanelHeader,
    MatExpansionPanelTitle,
    FontAwesomeModule,
    NgIf,
    FormsModule,
    EspModuleComponent,
    NgFor,
    ModalComponent,
  ],
})
export class ModulesComponent implements AfterViewInit {
  @ViewChild('modalContainer', { read: ViewContainerRef })
  container!: ViewContainerRef;

  skipControllers = false;

  bodyTestId = 'body';
  coreTestId = 'core';
  domeTestId = 'dome';

  isLoaded = false;

  backgroundClickDisabled = '1';

  possibleControllers: ControlModule[] = [];
  availableDomeControllers: ControlModule[] = [];
  availableCoreControllers: ControlModule[] = [];

  coreWarning = faExclamationTriangle;
  domeWarning = faExclamationTriangle;
  bodyWarning = faExclamationTriangle;

  @ViewChild('core', { static: false }) coreEl!: ElementRef;
  @ViewChild('dome', { static: false }) domeEl!: ElementRef;
  @ViewChild('body', { static: false }) bodyEl!: ElementRef;

  coreLocation!: ControllerLocation;
  domeLocation!: ControllerLocation;
  bodyLocation!: ControllerLocation;

  coreControllerId = '';
  domeControllerId = '';

  coreCaption: Caption = { str: 'Module Down' };
  domeCaption: Caption = { str: 'Module Down' };
  bodyCaption: Caption = { str: 'Module Down' };

  private notSynced = 'Not Synced';
  private moduleDown = 'Module Down';

  constructor(
    private controllerService: ControllerService,
    private websocketService: WebsocketService,
    private snackBar: SnackbarService,
    private modalService: ModalService,
    private renderer: Renderer2,
    private status: StatusService,
    private route: ActivatedRoute,
  ) {
    this.skipControllers =
      this.route.snapshot.paramMap.get('action') === 'skip-controllers';
  }

  ngAfterViewInit(): void {
    this.openControllerSyncModal();
  }

  //#region Loading Modal

  openControllerSyncModal() {
    this.container.clear();

    const modalResources = new Map<string, unknown>();

    if (this.skipControllers) {
      modalResources.set(LoadingModalResources.skipControllerLoading, true);
    }

    const component = this.container.createComponent(LoadingModalComponent);

    component.instance.resources = modalResources;
    component.instance.modalCallback.subscribe((result: ModalCallbackEvent) => {
      this.syncModalCallback(result);
    });

    this.modalService.open('modules-modal');
  }

  syncModalCallback(evt: ModalCallbackEvent) {
    if (evt.type !== LoadingModalResources.closeEvent) {
      return;
    }
    const response = evt.value as LoadingModalResponse;

    this.parseModules(response.locations);

    // always filter out the master controller since it's always the body module
    this.possibleControllers = response.controllers.filter(
      (controller: ControlModule) => controller.address !== '00:00:00:00:00:00',
    );

    this.availableCoreControllers = this.possibleControllers.filter(
      (controller: ControlModule) =>
        controller.id !== this.domeLocation.controller?.id,
    );
    this.availableDomeControllers = this.possibleControllers.filter(
      (controller: ControlModule) =>
        controller.id !== this.coreLocation.controller?.id,
    );

    this.handleStatus(
      this.status.getCoreStatus(),
      this.coreEl,
      this.coreCaption,
    );
    this.handleStatus(
      this.status.getDomeStatus(),
      this.domeEl,
      this.domeCaption,
    );
    this.handleStatus(
      this.status.getBodyStatus(),
      this.bodyEl,
      this.bodyCaption,
    );

    this.status.coreStateObserver.subscribe((value) =>
      this.handleStatus(value, this.coreEl, this.coreCaption),
    );
    this.status.domeStateObserver.subscribe((value) =>
      this.handleStatus(value, this.domeEl, this.domeCaption),
    );
    this.status.bodyStateObserver.subscribe((value) =>
      this.handleStatus(value, this.bodyEl, this.bodyCaption),
    );

    console.log('core controller:', this.coreLocation.controller.id);

    this.isLoaded = true;

    this.modalService.close('modules-modal');
  }
  //#endregion

  //#region Alert Modal
  openAlertModal(message: string) {
    this.container.clear();

    const modalResources = new Map<string, unknown>();

    const component = this.container.createComponent(AlertModalComponent);

    component.instance.resources = modalResources;
    component.instance.resources.set(AlertModalResources.message, message);

    component.instance.modalCallback.subscribe((_: unknown) => {
      this.modalService.close('modules-modal');
    });

    this.modalService.open('modules-modal');
  }
  //#endregion

  //#region Module Modals
  addModule(value: AddModuleEvent) {
    this.container.clear();

    const modalResources = new Map<string, unknown>();

    const component = this.container.createComponent(AddModuleModalComponent);

    component.instance.resources = modalResources;
    component.instance.resources.set(
      AddModuleModalResources.locationId,
      value.locationId,
    );
    component.instance.resources.set(
      AddModuleModalResources.moduleType,
      value.module,
    );

    component.instance.modalCallback.subscribe((result: ModalCallbackEvent) => {
      this.addModalCallback(result);
    });

    this.modalService.open('modules-modal');
  }

  addModalCallback(evt: ModalCallbackEvent) {
    if (evt.type === AddModuleModalResources.closeEvent) {
      this.modalService.close('modules-modal');
      this.container.clear();
      return;
    }

    if (evt.type !== AddModuleModalResources.addEvent) {
      return;
    }

    const response = evt.value as AddModuleModalResponse;
    this.doAddModule(response);

    this.modalService.close('modules-modal');
    this.container.clear();
  }

  removeModule(event: RemoveModuleEvent) {
    this.container.clear();
    const modalResources = new Map<string, unknown>();

    const component = this.container.createComponent(ConfirmModalComponent);

    component.instance.resources = modalResources;
    component.instance.resources.set(
      ConfirmModalResources.action,
      'Remove Module',
    );
    component.instance.resources.set(
      ConfirmModalResources.message,
      'Are you sure you want to remove this module?',
    );
    component.instance.resources.set(ConfirmModalResources.confirmEvent, event);

    component.instance.modalCallback.subscribe((result: ModalCallbackEvent) => {
      this.removeModuleCallback(result);
    });

    this.modalService.open('modules-modal');
  }

  removeModuleCallback(evt: ModalCallbackEvent) {
    if (evt.type === ConfirmModalResources.closeEvent) {
      this.modalService.close('modules-modal');
      this.container.clear();
      return;
    }

    if (evt.type !== ConfirmModalResources.confirmEvent) {
      return;
    }
    const response = evt.value as RemoveModuleEvent;

    switch (response.module) {
      case ModuleType.uart:
        this.removeUartModule(response.locationId, response.id);
        break;
      case ModuleType.i2c:
        this.removeI2CModule(response.locationId, response.id);
        break;
      case ModuleType.gpio:
        //this.removeGPIOchannel(response.locationId, response.id);
        break;
    }

    this.modalService.close('modules-modal');
    this.container.clear();
  }

  //#endregion

  //#region Module logic

  doAddModule(response: AddModuleModalResponse) {
    switch (response.moduleType) {
      case ModuleType.uart:
        this.addUartModule(response.locationId, response.moduleSubType);
        break;
      case ModuleType.i2c:
        this.addI2CModule(response.locationId, response.moduleSubType);
        break;
      case ModuleType.gpio:
        //this.addGPIOchannel(response.locationId, response.moduleSubType);
        break;
    }
  }

  //#region Serial Modules
  addUartModule(location: string, subType: ModuleSubType) {
    const controller = this.getControllerLocationById(location);

    if (!controller) {
      return;
    }

    const defaultChannel =
      controller.locationName === AstrOsConstants.BODY ? 2 : 1;

    const module = new UartModule(
      0,
      crypto.randomUUID(),
      'New Serial Module',
      location,
      subType,
      defaultChannel,
      9600,
    );

    switch (subType) {
      case ModuleSubType.humanCyborgRelationsSerial:
        module.subModule = new HumanCyborgRelationsModule();
        break;
      case ModuleSubType.kangaroo:
        module.subModule = new KangarooX2(
          crypto.randomUUID(),
          'Channel 1',
          'Channel 2',
        );
        break;
      case ModuleSubType.maestro:
        module.subModule = this.generateMaestroModule(module.id);
        break;
    }

    controller.uartModules.push(module);
  }

  generateMaestroModule(moduleId: string) {
    const subModule = new MaestroModule();

    const boardId = crypto.randomUUID();

    subModule.boards = [new MaestroBoard(boardId, moduleId, 0, 'Board 1', 24)];

    for (let i = 0; i < 24; i++) {

      subModule.boards[0].channels.push(
        new MaestroChannel(
          crypto.randomUUID(),
          subModule.boards[0].id,
          `Channel ${i}`,
          false,
          i,
          false,
          500,
          2500,
          1250,
          false,
        ),
      );
    }

    return subModule;
  }

  removeUartModule(location: string, moduleId: string) {
    const controller = this.getControllerLocationById(location);

    if (!controller) {
      return;
    }

    controller.uartModules = controller.uartModules
      .filter((module: UartModule) => module.id !== moduleId)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  //#endregion

  //#region I2C Modules

  addI2CModule(location: string, subType: ModuleSubType) {
    const controller = this.getControllerLocationById(location);

    if (!controller) {
      return;
    }

    const nextAddress = this.getNextI2CAddress(controller.i2cModules);

    if (nextAddress === -1) {
      this.openAlertModal('All I2C addresses are in use.');
      return;
    }

    const module = new I2cModule(
      0,
      crypto.randomUUID(),
      'New I2C Module',
      location,
      nextAddress,
      subType,
    );

    switch (subType) {
      case ModuleSubType.genericI2C:
        break;
      case ModuleSubType.humanCyborgRelationsI2C:
        break;
      case ModuleSubType.pwmBoard:
        break;
    }

    controller.i2cModules.push(module);
  }

  removeI2CModule(location: string, moduleId: string) {
    const controller = this.getControllerLocationById(location);

    if (!controller) {
      return;
    }

    controller.i2cModules = controller.i2cModules
      .filter((module: I2cModule) => module.id !== moduleId)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  //#endregion

  //#region Controller Selection

  controllerSelectChanged(location: string) {
    if (location === AstrOsConstants.CORE) {
      const idx = this.possibleControllers.findIndex(
        (controller: ControlModule) => controller.id === this.coreControllerId,
      );
      if (idx !== -1) {
        this.coreLocation.controller = this.availableCoreControllers[idx];

        this.availableDomeControllers = this.possibleControllers.filter(
          (controller: ControlModule) =>
            controller.id !== this.availableCoreControllers[idx].id,
        );
      }
    } else if (location === AstrOsConstants.DOME) {
      const idx = this.possibleControllers.findIndex(
        (controller: ControlModule) => controller.id === this.domeControllerId,
      );
      if (idx !== -1) {
        this.domeLocation.controller = this.availableDomeControllers[idx];

        this.availableCoreControllers = this.possibleControllers.filter(
          (controller: ControlModule) =>
            controller.id !== this.availableCoreControllers[idx].id,
        );
      }
    }
  }

  //#endregion
  //#region Data Persistence

  saveModuleSettings() {
    const observer = {
      next: (result: unknown) => {
        if (result && typeof result === 'object' && 'message' in result) {
          if (result.message === 'success') {
            console.log('module settings saved!');
            this.snackBar.okToast('Module settings saved!');
          } else {
            console.log('module settings save failed!');
            this.snackBar.okToast('Module settings save failed!');
          }
        }
      },
      error: (err: unknown) => {
        console.error(err);
        this.snackBar.okToast('Module settings save failed!');
      },
    };

    this.controllerService
      .saveLocations(
        new AstrOsLocationCollection(
          this.coreLocation,
          this.domeLocation,
          this.bodyLocation,
        ),
      )
      .subscribe(observer);

    this.status.resetStatus();
  }

  syncModuleSettings() {
    const observer = {
      next: (result: unknown) => {
        if (result && typeof result === 'object' && 'message' in result) {
          if (result.message === 'success') {
            console.log('module sync queued!');
            this.snackBar.okToast('Module sync queued!');
          } else {
            console.log('module sync failed to queue');
            this.snackBar.okToast(`Module sync failed to queue.`);
          }
        }
      },
      error: (err: unknown) => {
        console.error(err);
        this.snackBar.okToast('Module sync failed!');
      },
    };

    this.controllerService.syncLocationConfig().subscribe(observer);
  }

  //#endregion

  //#region Servo Test

  openServoTestModal(value: ServoTestEvent) {
    if (!value.controllerAddress) {
      this.openAlertModal('Location for this servo is not set.');
      return;
    }

    this.container.clear();

    const modalResources = new Map<string, unknown>();

    const component = this.container.createComponent(ServoTestModalComponent);

    component.instance.resources = modalResources;
    component.instance.resources.set(
      ServoTestModalResources.controllerAddress,
      value.controllerAddress,
    );
    component.instance.resources.set(
      ServoTestModalResources.controllerName,
      value.controllerName,
    );
    component.instance.resources.set(
      ServoTestModalResources.moduleSubType,
      value.moduleSubType,
    );
    component.instance.resources.set(
      ServoTestModalResources.moduleIdx,
      value.moduleIdx,
    );
    component.instance.resources.set(
      ServoTestModalResources.channelNumber,
      value.channelNumber,
    );

    component.instance.modalCallback.subscribe((result: ModalCallbackEvent) => {
      this.servoTestModalCallback(result);
    });

    this.modalService.open('modules-modal');
  }

  servoTestModalCallback(evt: ModalCallbackEvent) {
    switch (evt.type) {
      case ServoTestModalResources.sendServoMove: {
        const servoTest = evt.value as ServoTestEvent;
        this.websocketService.sendMessage({
          msgType: 'SERVO_TEST',
          data: {
            controllerAddress: servoTest.controllerAddress,
            controllerName: servoTest.controllerName,
            moduleSubType: servoTest.moduleSubType,
            moduleIdx: servoTest.moduleIdx,
            channelNumber: servoTest.channelNumber,
            value: servoTest.value,
          },
        });
        break;
      }
      case ServoTestModalResources.closeEvent: {
        this.modalService.close('modules-modal');
        this.container.clear();
        break;
      }
    }
  }

  //#endregion

  //#region Helper Functions

  private parseModules(locations: AstrOsLocationCollection) {
    try {
      this.coreLocation = locations.coreModule ?? this.coreLocation;
      this.coreControllerId = this.coreLocation.controller?.id;
      this.domeLocation = locations.domeModule ?? this.domeLocation;
      this.domeControllerId = this.domeLocation.controller.id;
      this.bodyLocation = locations.bodyModule ?? this.bodyLocation;
    } catch (err) {
      console.error(err);
    }
  }

  private handleStatus(
    status: ControllerStatus,
    el: ElementRef,
    caption: Caption,
  ) {
    switch (status) {
      case ControllerStatus.up:
        caption.str = '';
        this.renderer.setStyle(el.nativeElement, 'visibility', 'hidden');
        break;
      case ControllerStatus.needsSynced:
        caption.str = this.notSynced;
        this.renderer.setStyle(el.nativeElement, 'color', 'yellow');
        this.renderer.setStyle(el.nativeElement, 'visibility', 'visible');
        break;
      case ControllerStatus.down:
        caption.str = this.moduleDown;
        this.renderer.setStyle(el.nativeElement, 'color', 'red');
        this.renderer.setStyle(el.nativeElement, 'visibility', 'visible');
        break;
    }
  }

  private getControllerLocationById(id: string): ControllerLocation | null {
    if (this.coreLocation.id === id) {
      return this.coreLocation;
    } else if (this.domeLocation.id === id) {
      return this.domeLocation;
    } else if (this.bodyLocation.id === id) {
      return this.bodyLocation;
    } else {
      return null;
    }
  }

  private getControllerLocationByLocationId(
    locationId: string,
  ): ControllerLocation {
    switch (locationId) {
      case AstrOsConstants.BODY:
        return this.bodyLocation;
      case AstrOsConstants.CORE:
        return this.coreLocation;
      case AstrOsConstants.DOME:
        return this.domeLocation;
    }
    return this.bodyLocation;
  }

  private getNextI2CAddress(modules: I2cModule[]): number {
    const addresses = modules.map((module: I2cModule) => module.i2cAddress);
    for (let i = 0; i < 128; i++) {
      if (!addresses.includes(i)) {
        return i;
      }
    }
    return -1;
  }
}

//#endregion
