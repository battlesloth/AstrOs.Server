import { AfterViewInit, Component, ElementRef, OnInit, Renderer2, ViewChild, ViewContainerRef } from '@angular/core';
import { MatExpansionPanel } from '@angular/material/expansion';
import { ControllerService } from 'src/app/services/controllers/controller.service';
import { ControlModule, ControllerStatus, AstrOsLocationCollection, AstrOsConstants, ControllerLocation, UartType } from 'astros-common';
import { faExclamationTriangle } from '@fortawesome/free-solid-svg-icons';
import { SnackbarService } from 'src/app/services/snackbar/snackbar.service';
import { StatusService } from 'src/app/services/status/status.service';
import { ModalService } from 'src/app/modal';
import { LoadingModalComponent } from './loading-modal/loading-modal.component';

@Component({
  selector: 'app-modules',
  templateUrl: './modules.component.html',
  styleUrls: ['./modules.component.scss'],
  viewProviders: [MatExpansionPanel]
})
export class ModulesComponent implements OnInit, AfterViewInit {

  @ViewChild('modalContainer', { read: ViewContainerRef }) container!: ViewContainerRef;

  backgroundClickDisabled: string = '1';
  isMaster: boolean = true;

  coreWarning = faExclamationTriangle;
  domeWarning = faExclamationTriangle;
  bodyWarning = faExclamationTriangle;

  @ViewChild('core', { static: false }) coreEl!: ElementRef;
  @ViewChild('dome', { static: false }) domeEl!: ElementRef;
  @ViewChild('body', { static: false }) bodyEl!: ElementRef;

  coreLocation!: ControllerLocation;
  domeLocation!: ControllerLocation;
  bodyLocation!: ControllerLocation;

  coreCaption: any = { str: 'Pending...' }
  domeCaption: any = { str: 'Pending...' }
  bodyCaption: any = { str: 'Pending...' }

  private notSynced = "Not Synced";
  private moduleDown = "Module Down";

  constructor(private controllerService: ControllerService,
    private snackBar: SnackbarService,
    private modalService: ModalService,
    private renderer: Renderer2,
    private status: StatusService) {

    //this.bodyLocation = new ControllerLocation(1, AstrOsConstants.BODY, 'Body Module', '');
    //this.bodyLocation.uartModule.channels[0] = { type: UartType.none, id: 0, channelName: 'None', module: {} };
    //this.bodyLocation.uartModule.channels[1] = { type: UartType.none, id: 1, channelName: 'None', module: {} };
    //this.coreLocation = new ControllerLocation(2, AstrOsConstants.CORE, 'Core Dome Module', '');
    //this.coreLocation.uartModule.channels[0] = { type: UartType.none, id: 0, channelName: 'None', module: {} };
    //this.coreLocation.uartModule.channels[1] = { type: UartType.none, id: 1, channelName: 'None', module: {} };
    //this.domeLocation = new ControllerLocation(3, AstrOsConstants.DOME, 'Outer Dome Module', '');
    //this.domeLocation.uartModule.channels[0] = { type: UartType.none, id: 0, channelName: 'None', module: {} };
    //this.domeLocation.uartModule.channels[1] = { type: UartType.none, id: 1, channelName: 'None', module: {} };

    this.status.coreStateObserver.subscribe(value => this.handleStatus(value, this.coreEl, this.coreCaption));
    this.status.domeStateObserver.subscribe(value => this.handleStatus(value, this.domeEl, this.domeCaption));
    this.status.bodyStateObserver.subscribe(value => this.handleStatus(value, this.bodyEl, this.bodyCaption));
  }

  ngOnInit(): void {

    const observer = {
      next: (result: any) => this.parseModules(result),
      error: (err: any) => console.error(err)
    };

    this.controllerService.getLoadedLocations().subscribe(observer);
  }

  ngAfterViewInit(): void {
    this.handleStatus(this.status.getCoreStatus(), this.coreEl, this.coreCaption);
    this.handleStatus(this.status.getDomeStatus(), this.domeEl, this.domeCaption);
    this.handleStatus(this.status.getBodyStatus(), this.bodyEl, this.bodyCaption);

    this.openControllerSyncModal();
  }

  openControllerSyncModal() {
    this.container.clear();

    const modalResources = new Map<string, any>();

    const component = this.container.createComponent(LoadingModalComponent);

    component.instance.resources = modalResources;
    component.instance.modalCallback.subscribe((result: any) => {
      this.modalService.close('modules-modal');
    });

    this.modalService.open('modules-modal');
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
