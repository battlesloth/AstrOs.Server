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
  UartType,
  ModuleSubType,
  UartModule,
  HumanCyborgRelationsModule,
  KangarooX2,
  MaestroModule,
  I2cModule,
  I2cType,
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
  EspModuleComponent, 
  RemoveModuleEvent 
} from '@src/components/esp-module';
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
  ServoTestMessage,
  AddModuleModalResponse,
} from '@src/components/modals/modules';



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

  isLoaded = false;

  backgroundClickDisabled = '1';
  isMaster = true;

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
  ) { }

  ngAfterViewInit(): void {
    this.openControllerSyncModal();
  }

  openControllerSyncModal() {
    this.container.clear();

    const modalResources = new Map<string, unknown>();

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
      (controller: ControlModule) => controller.id !== 1,
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

    this.isLoaded = true;

    this.modalService.close('modules-modal');
  }

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
      this.modalCallback(result);
    });

    this.modalService.open('modules-modal');
  }

  removeModule(event: RemoveModuleEvent) {
    this.container.clear();

    const modalResources = new Map<string, unknown>();

    const component = this.container.createComponent(ConfirmModalComponent);

    component.instance.resources = modalResources;
    component.instance.resources.set(
      ConfirmModalResources.action,
      'Remove Module'
    );
    component.instance.resources.set(
      ConfirmModalResources.message,
      'Are you sure you want to remove this module?'
    );
    component.instance.resources.set(
      ConfirmModalResources.confirmEvent,
      event
    );

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

    switch (response.module){
      case ModuleType.uart:
        this.removeUartModule(response.locationId, response.id);
        break;
      case ModuleType.i2c:
        this.removeI2CModule(response.locationId, response.id);
        break;
      case ModuleType.gpio:
        this.removeGPIOchannel(response.locationId, response.id);
        break;
    }

    this.modalService.close('modules-modal');
    this.container.clear();
  
  }

  modalCallback(evt: ModalCallbackEvent) {
    switch (evt.type) {
      case AddModuleModalResources.addEvent: {
        const response = evt.value as AddModuleModalResponse;
        this.doAddModule(response);
        break;
      }
      case ConfirmModalResources.confirmEvent:
        break
    }
  
    this.modalService.close('modules-modal');
    this.container.clear();
  }

  openServoTestModal(value: { controllerId: number; channelId: number }) {
    if (value.controllerId === 0) {
      this.openAlertModal('Location for this servo is not set.');
      return;
    }

    this.container.clear();

    const modalResources = new Map<string, unknown>();

    const component = this.container.createComponent(ServoTestModalComponent);

    component.instance.resources = modalResources;
    component.instance.resources.set(
      ServoTestModalResources.controllerId,
      value.controllerId,
    );
    component.instance.resources.set(
      ServoTestModalResources.servoId,
      value.channelId,
    );

    component.instance.modalCallback.subscribe((result: ModalCallbackEvent) => {
      this.servoTestModalCallback(result);
    });

    this.modalService.open('modules-modal');
  }

  servoTestModalCallback(evt: ModalCallbackEvent) {
    switch (evt.type) {
      case ServoTestModalResources.sendServoMove: {
        const servoTest = evt.value as ServoTestMessage;
        this.websocketService.sendMessage({
          msgType: 'SERVO_TEST',
          data: {
            controllerId: servoTest.controllerId,
            servoId: servoTest.servoId,
            value: servoTest.value,
          },
        });
        break;
      }
      case ServoTestModalResources.closeEvent:
        this.modalService.close('modules-modal');
        break;
    }
  }

  doAddModule(response: AddModuleModalResponse) {
    switch (response.moduleType) {
      case ModuleType.uart:
        this.addUartModule(response.locationId, response.moduleSubType);
        break;
      case ModuleType.i2c:
        this.addI2CModule(response.locationId, response.moduleSubType);
        break;
      case ModuleType.gpio:
        this.addGPIOchannel(response.locationId, response.moduleSubType);
        break;
    }
  }

  addUartModule(location: number, subType: ModuleSubType) {
    
    const controller = this.getControllerLocation(location);

    const defaultChannel = location === 1 ? 2 : 1;
    const uartType = this.subtypeToUartType(subType);

    const module = new UartModule(
      crypto.randomUUID(),
      location,
      uartType,
      defaultChannel,
      9600,
      'New Serial Module',
    );

    switch (uartType) {
      case UartType.humanCyborgRelations:
        module.subModule = new HumanCyborgRelationsModule();
        break;
      case UartType.kangaroo:
        module.subModule = new KangarooX2(crypto.randomUUID(), 'Channel 1', 'Channel 2');
        break;
      case UartType.maestro:
        module.subModule = new MaestroModule();
        break;
    }

    controller.uartModules.push(module);
  }

  addI2CModule(location: number, subType: ModuleSubType) {
    
    const controller = this.getControllerLocation(location);
    const i2cType = this.subtypeToI2cType(subType);
    const nextAddress = this.getNextI2CAddress(controller.i2cModules);

    if (nextAddress === -1) {
      this.openAlertModal('All I2C addresses are in use.');
      return;
    }

    const module = new I2cModule(
      crypto.randomUUID(),
      "New I2C Module",
      location,
      nextAddress,
      i2cType
    );
    
    switch (i2cType) {
      case I2cType.genericI2C:
        break;
      case I2cType.humanCyborgRelations:
        break;
      case I2cType.pwmBoard:
        break;
    }

    controller.i2cModules.push(module);
  }

  addGPIOchannel(location: number, gpioType: ModuleSubType) {
  }


  removeUartModule(location: number, moduleId: string) {
    const controller = this.getControllerLocation(location);

    controller.uartModules = controller.uartModules.filter(
      (module: UartModule) => module.id !== moduleId,
    ).sort((a, b) => a.name.localeCompare(b.name));
  }

  removeI2CModule(location: number, moduleId: string) {
    const controller = this.getControllerLocation(location);

    controller.i2cModules = controller.i2cModules.filter(
      (module: I2cModule) => module.id !== moduleId,
    ).sort((a, b) => a.name.localeCompare(b.name));
  }

  removeGPIOchannel(location: number, channelId: string) {
    const controller = this.getControllerLocation(location);

    /*controller.gpioChannels = controller.gpioChannels.filter(
      (channel: string) => channel !== channelId,
    );
    */
  }


  controllerSelectChanged(_: unknown) {
    this.availableCoreControllers = this.possibleControllers.filter(
      (controller: ControlModule) =>
        controller.id !== this.domeLocation.controller?.id,
    );
    this.availableDomeControllers = this.possibleControllers.filter(
      (controller: ControlModule) =>
        controller.id !== this.coreLocation.controller?.id,
    );
  }

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

  private parseModules(locations: AstrOsLocationCollection) {
    console.log(locations);
    try {
      this.coreLocation = locations.coreModule ?? this.coreLocation;
      this.domeLocation = locations.domeModule ?? this.domeLocation;
      this.bodyLocation = locations.bodyModule ?? this.bodyLocation;
    } catch (err) {
      console.error(err);
    }
  }

  handleStatus(status: ControllerStatus, el: ElementRef, caption: Caption) {
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

  private getControllerLocation(controllerId: number): ControllerLocation {
    switch (controllerId) {
      case 1:
        return this.bodyLocation;
      case 2:
        return this.coreLocation;
      case 3:
        return this.domeLocation;
    }
    return this.bodyLocation;
  }

  private subtypeToUartType(subtype: ModuleSubType): UartType {
    switch (subtype) {
      case ModuleSubType.genericSerial:
        return UartType.genericSerial;
      case ModuleSubType.humanCyborgRelationsSerial:
        return UartType.humanCyborgRelations;
      case ModuleSubType.kangaroo:
        return UartType.kangaroo;
      case ModuleSubType.maestro:
        return UartType.maestro;
    }
    return UartType.genericSerial;
  }

  private subtypeToI2cType(subtype: ModuleSubType): I2cType {
    switch (subtype) {
      case ModuleSubType.genericI2C:
        return I2cType.genericI2C;
      case ModuleSubType.humanCyborgRelationsI2C:
        return I2cType.humanCyborgRelations;
      case ModuleSubType.pwmBoard:
        return I2cType.pwmBoard;
    }
    return I2cType.genericI2C;
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
