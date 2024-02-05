import { AfterViewInit, Component, ElementRef, OnInit, Renderer2, ViewChild } from '@angular/core';
import { MatExpansionPanel } from '@angular/material/expansion';
import { ControllerService } from 'src/app/services/controllers/controller.service';
import { ControlModule, ControllerStatus, AstrOsModuleCollection, AstrOsConstants } from 'astros-common';
import { faExclamationTriangle } from '@fortawesome/free-solid-svg-icons';
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

  coreCaption: any = { str: 'Pending...' }
  domeCaption: any = { str: 'Pending...' }
  bodyCaption: any = { str: 'Pending...' }

  private notSynced = "Not Synced";
  private moduleDown = "Module Down";

  constructor(private controllerService: ControllerService,
    private snackBar: SnackbarService,
    private renderer: Renderer2,
    private status: StatusService) {

    this.coreModule = new ControlModule(1, AstrOsConstants.CORE, AstrOsConstants.CORE, 'Core Dome Module', '', '');
    this.domeModule = new ControlModule(2, AstrOsConstants.DOME, AstrOsConstants.DOME, 'Outer Dome Module', '', '');
    this.bodyModule = new ControlModule(3, AstrOsConstants.BODY, AstrOsConstants.BODY, 'Body Module', '', '');

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

    this.controllerService.saveControllers(new AstrOsModuleCollection(this.coreModule, this.domeModule, this.bodyModule))
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

  private parseModules(modules: AstrOsModuleCollection) {
    try {
      this.coreModule = modules.coreModule ?? this.coreModule;
      this.domeModule = modules.domeModule ?? this.domeModule;
      this.bodyModule = modules.bodyModule ?? this.bodyModule;
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
