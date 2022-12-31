import { AfterViewInit, Component, ElementRef, OnInit, Renderer2, ViewChild } from '@angular/core';
import { MatExpansionPanel } from '@angular/material/expansion';
import { ControllerService } from 'src/app/services/controllers/controller.service';
import { ControlModule, ControllerType, TransmissionType, StatusResponse, ControllerStatus } from 'astros-common';
import {  faExclamationTriangle } from '@fortawesome/free-solid-svg-icons';
import { WebsocketService } from 'src/app/services/websocket/websocket.service';
import { SnackbarService } from 'src/app/services/snackbar/snackbar.service';
import { StatusService } from 'src/app/services/status/status.service';

@Component({
  selector: 'app-modules',
  templateUrl: './modules.component.html',
  styleUrls: ['./modules.component.scss'],
  viewProviders: [MatExpansionPanel]
})
export class ModulesComponent implements OnInit, AfterViewInit {

  coreWarning = faExclamationTriangle;
  domeWarning = faExclamationTriangle;
  bodyWarning = faExclamationTriangle;

  @ViewChild('core', { static: false }) coreEl!: ElementRef;
  @ViewChild('dome', { static: false }) domeEl!: ElementRef;
  @ViewChild('body', { static: false }) bodyEl!: ElementRef;

  coreModule!: ControlModule;
  domeModule!: ControlModule;
  bodyModule!: ControlModule;

  coreCaption: any = {str: 'Pending...'}
  domeCaption: any = {str: 'Pending...'}
  bodyCaption: any = {str: 'Pending...'}

  private notSynced = "Not Synced";
  private moduleDown = "Module Down";

  constructor(private controllerService: ControllerService,
    private snackBar: SnackbarService,
    private renderer: Renderer2,
    private status: StatusService) {

    this.coreModule = new ControlModule(ControllerType.core, 'Core Dome Module', '');
    this.domeModule = new ControlModule(ControllerType.dome, 'Outer Dome Module', '');
    this.bodyModule = new ControlModule(ControllerType.body, 'Body Module', '');

    this.status.coreStateObserver.subscribe(value => this.handleStatus(value, this.coreEl, this.coreCaption));
    this.status.domeStateObserver.subscribe(value => this.handleStatus(value, this.domeEl, this.domeCaption));
    this.status.bodyStateObserver.subscribe(value => this.handleStatus(value, this.bodyEl, this.bodyCaption));
}

  ngOnInit(): void {
    const observer = {
      next: (result: any) => this.parseModules(result),
      error: (err: any) => console.error(err)
    };

    this.controllerService.getControllers().subscribe(observer);
  }

    ngAfterViewInit(): void {  
    this.handleStatus(this.status.getCoreStatus(), this.coreEl, this.coreCaption);
    this.handleStatus(this.status.getDomeStatus(), this.domeEl, this.domeCaption);
    this.handleStatus(this.status.getBodyStatus(), this.bodyEl, this.bodyCaption);

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

    this.controllerService.saveControllers([this.coreModule, this.domeModule, this.bodyModule])
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

    this.controllerService.syncControllers()
      .subscribe(observer);
  }

  private parseModules(modules: ControlModule[]) {
    modules.forEach((module: ControlModule) => {
      try {
        switch (module.id) {
          case ControllerType.core:
            this.coreModule = module;
            break;
          case ControllerType.dome:
            this.domeModule = module;
            break;
          case ControllerType.body:
            this.bodyModule = module;
            break;
        };
      } catch (err) {
        console.error(err);
      }
    });
  }

  //statusUpdate(status: StatusResponse) {
  //  {
  //    switch (status.controllerType) {
  //      case ControllerType.core:
  //        this.coreWarningVis = this.updateUi(status.up, status.synced, this.coreWarningVis, this.coreEl);
  //        this.coreColor = this.setColor(status.up, status.synced, this.coreColor, this.coreEl);
  //        if (!status.up) {
  //          this.coreStatus = this.moduleDown;
  //        } else if (!status.synced) {
  //          this.coreStatus = this.notSynced;
  //        }
  //        break;
  //      case ControllerType.dome:
  //        this.domeWarningVis = this.updateUi(status.up, status.synced, this.domeWarningVis, this.domeEl);
  //        this.domeColor = this.setColor(status.up, status.synced, this.domeColor, this.domeEl);
  //        if (!status.up) {
  //          this.domeStatus = this.moduleDown;
  //        } else if (!status.synced) {
  //          this.domeStatus = this.notSynced;
  //        }
  //        break;
  //      case ControllerType.body:
  //        this.bodyWarningVis = this.updateUi(status.up, status.synced, this.bodyWarningVis, this.bodyEl);
  //        this.bodyColor = this.setColor(status.up, status.synced, this.bodyColor, this.bodyEl);
  //        if (!status.up) {
  //          this.bodyStatus = this.moduleDown;
  //        } else if (!status.synced) {
  //          this.bodyStatus = this.notSynced;
  //        }
  //        break;
  //    }
  //  }
  //}
//
  //private setColor(up: boolean, synced: boolean, color: string, el: ElementRef): string {
  //  if (!up) {
  //    if (color !== 'red') {
  //      this.renderer.setStyle(el.nativeElement, 'color', 'red');
  //    }
  //    return 'red';
  //  } else if (!synced && color != 'yellow') {
  //    this.renderer.setStyle(el.nativeElement, 'color', 'yellow');
  //    return 'yellow';
  //  }
  //  return 'red';
  //}
//
  //private updateUi(up: boolean, synced: boolean, visible: boolean, el: ElementRef): boolean {
  //  if (up && synced) {
  //    if (visible) {
  //      this.renderer.setStyle(el.nativeElement, 'visibility', 'hidden');
  //    }
  //    return false;
  //  } else {
  //    if (!visible) {
  //      this.renderer.setStyle(el.nativeElement, 'visibility', 'visible');
  //    }
  //  }
  //  return true;
  //}

  handleStatus(status: ControllerStatus, el: ElementRef, caption: any){
    switch (status){
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
