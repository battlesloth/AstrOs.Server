import { AfterViewInit, Component, ElementRef, OnInit, Renderer2, ViewChild, ViewContainerRef } from '@angular/core';
import { MatExpansionPanel, MatAccordion, MatExpansionPanelHeader, MatExpansionPanelTitle } from '@angular/material/expansion';
import { ControllerService } from 'src/app/services/controllers/controller.service';
import { ControlModule, ControllerStatus, AstrOsLocationCollection, ControllerLocation } from 'astros-common';
import { faExclamationTriangle } from '@fortawesome/free-solid-svg-icons';
import { SnackbarService } from 'src/app/services/snackbar/snackbar.service';
import { StatusService } from 'src/app/services/status/status.service';
import { ModalService } from 'src/app/modal';
import { LoadingModalComponent } from './loading-modal/loading-modal.component';
import { ServoTestModalComponent } from './servo-test-modal/servo-test-modal.component';
import { ModalCallbackEvent, ModalResources } from 'src/app/shared/modal-resources';
import { AlertModalComponent } from 'src/app/modal/alert-modal/alert-modal.component';
import { WebsocketService } from 'src/app/services/websocket/websocket.service';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { NgIf, NgFor } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { EspModuleComponent } from './esp-module/esp-module.component';
import { ModalComponent } from '../../modal/modal.component';

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
    ModalComponent
  ]
})
export class ModulesComponent implements OnInit, AfterViewInit {

  @ViewChild('modalContainer', { read: ViewContainerRef }) container!: ViewContainerRef;

  isLoaded = false;

  backgroundClickDisabled: string = '1';
  isMaster: boolean = true;

  possibleControllers: Array<ControlModule> = [];
  availableDomeControllers: Array<ControlModule> = [];
  availableCoreControllers: Array<ControlModule> = [];

  coreWarning = faExclamationTriangle;
  domeWarning = faExclamationTriangle;
  bodyWarning = faExclamationTriangle;

  @ViewChild('core', { static: false }) coreEl!: ElementRef;
  @ViewChild('dome', { static: false }) domeEl!: ElementRef;
  @ViewChild('body', { static: false }) bodyEl!: ElementRef;

  coreLocation!: ControllerLocation;
  domeLocation!: ControllerLocation;
  bodyLocation!: ControllerLocation;

  coreCaption: any = { str: 'Module Down' }
  domeCaption: any = { str: 'Module Down' }
  bodyCaption: any = { str: 'Module Down' }

  private notSynced = "Not Synced";
  private moduleDown = "Module Down";

  constructor(private controllerService: ControllerService,
    private websocketService: WebsocketService,
    private snackBar: SnackbarService,
    private modalService: ModalService,
    private renderer: Renderer2,
    private status: StatusService) {

  }

  ngOnInit(): void {

  }

  ngAfterViewInit(): void {
    this.openControllerSyncModal();
  }

  openControllerSyncModal() {
    this.container.clear();

    const modalResources = new Map<string, any>();

    const component = this.container.createComponent(LoadingModalComponent);

    component.instance.resources = modalResources;
    component.instance.modalCallback.subscribe((result: any) => {
      this.syncModalCallback(result);
    });

    this.modalService.open('modules-modal');
  }

  syncModalCallback(evt: any) {
    this.parseModules(evt.response.locations);

    // always filter out the master controller since it's always the body module
    this.possibleControllers = evt.response.controllers.filter((controller: ControlModule) => controller.id !== 1);

    this.availableCoreControllers = this.possibleControllers.filter((controller: ControlModule) => controller.id !== this.domeLocation.controller?.id);
    this.availableDomeControllers = this.possibleControllers.filter((controller: ControlModule) => controller.id !== this.coreLocation.controller?.id);

    this.handleStatus(this.status.getCoreStatus(), this.coreEl, this.coreCaption);
    this.handleStatus(this.status.getDomeStatus(), this.domeEl, this.domeCaption);
    this.handleStatus(this.status.getBodyStatus(), this.bodyEl, this.bodyCaption);

    this.status.coreStateObserver.subscribe(value => this.handleStatus(value, this.coreEl, this.coreCaption));
    this.status.domeStateObserver.subscribe(value => this.handleStatus(value, this.domeEl, this.domeCaption));
    this.status.bodyStateObserver.subscribe(value => this.handleStatus(value, this.bodyEl, this.bodyCaption));

    this.isLoaded = true;

    this.modalService.close('modules-modal');
  }

  openAlertModal(message: string) {
    this.container.clear();

    const modalResources = new Map<string, any>();

    const component = this.container.createComponent(AlertModalComponent);

    component.instance.resources = modalResources;
    component.instance.resources.set(ModalResources.message, message);

    component.instance.modalCallback.subscribe((result: any) => {
      this.modalService.close('modules-modal');
    });

    this.modalService.open('modules-modal');
  }

  openServoTestModal(value: { controllerId: number, channelId: number }) {

    if (value.controllerId === 0) {
      this.openAlertModal("Location for this servo is not set.");
      return;
    }

    this.container.clear();

    const modalResources = new Map<string, any>();

    const component = this.container.createComponent(ServoTestModalComponent);

    component.instance.resources = modalResources;
    component.instance.resources.set(ModalResources.controllerId, value.controllerId);
    component.instance.resources.set(ModalResources.servoId, value.channelId);

    component.instance.modalCallback.subscribe((result: any) => {
      this.servoTestModalCallback(result);
    });

    this.modalService.open('modules-modal');
  }

  servoTestModalCallback(evt: any) {
    switch (evt.id) {
      case ModalCallbackEvent.sendServoMove:

        this.websocketService.sendMessage({ msgType: "SERVO_TEST", data: { controllerId: evt.controllerId, servoId: evt.servoId, value: evt.value } });

        break;
      case ModalCallbackEvent.close:
        this.modalService.close('modules-modal');
        break;
    }
  }

  controllerSelectChanged($event: any) {

    this.availableCoreControllers = this.possibleControllers.filter((controller: ControlModule) => controller.id !== this.domeLocation.controller?.id);
    this.availableDomeControllers = this.possibleControllers.filter((controller: ControlModule) => controller.id !== this.coreLocation.controller?.id);

  }

  saveModuleSettings() {
    const observer = {
      next: (result: any) => {
        if (result.message === 'success') {
          console.log('module settings saved!')
          this.snackBar.okToast('Module settings saved!');
        } else {
          console.log('module settings save failed!')
          this.snackBar.okToast('Module settings save failed!');
        }
      },
      error: (err: any) => {
        console.error(err);
        this.snackBar.okToast('Module settings save failed!');
      }
    };

    this.controllerService.saveLocations(new AstrOsLocationCollection(this.coreLocation, this.domeLocation, this.bodyLocation))
      .subscribe(observer);

    this.status.resetStatus();
  }

  syncModuleSettings() {
    const observer = {
      next: (result: any) => {
        if (result.message === 'success') {
          console.log('module sync queued!')
          this.snackBar.okToast('Module sync queued!');
        } else {
          console.log('module sync failed to queue')
          this.snackBar.okToast(`Module sync failed to queue.`);
        }
      },
      error: (err: any) => {
        console.error(err);
        this.snackBar.okToast('Module sync failed!');
      }
    };

    this.controllerService.syncLocationConfig()
      .subscribe(observer);
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

  handleStatus(status: ControllerStatus, el: ElementRef, caption: any) {
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
