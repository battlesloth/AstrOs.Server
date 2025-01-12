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
} from 'astros-common';
import { faExclamationTriangle } from '@fortawesome/free-solid-svg-icons';
import {
  LoadingModalComponent,
  LoadingModalResources,
  LoadingModalResponse,
  ServoTestModalComponent,
  ServoTestModalResources,
  ServoTestMessage,
  AlertModalComponent,
  AlertModalResources,
  ModalComponent,
  ModalCallbackEvent,
} from '@src/components/modals';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { NgIf, NgFor } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { EspModuleComponent } from '@src/components/esp-module';
import {
  ControllerService,
  ModalService,
  SnackbarService,
  StatusService,
  WebsocketService,
} from '@src/services';

interface Caption {
  str: string;
}

@Component({
  selector: 'app-modules',
  templateUrl: './modules.component.html',
  styleUrls: ['./modules.component.scss'],
  viewProviders: [MatExpansionPanel],
  standalone: true,
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
  ) {}

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
}
