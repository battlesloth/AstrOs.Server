import { Component, ElementRef, OnInit, Renderer2, ViewChild } from '@angular/core';
import { MatExpansionPanel } from '@angular/material/expansion';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ControllerService } from 'src/app/services/controllers/controller.service';
import { ControlModule, ControllerType } from 'astros-common';
import { faTrash, faExclamationTriangle } from '@fortawesome/free-solid-svg-icons';
import { WebsocketService } from 'src/app/services/websocket/websocket.service';

@Component({
  selector: 'app-modules',
  templateUrl: './modules.component.html',
  styleUrls: ['./modules.component.scss'],
  viewProviders: [MatExpansionPanel]
})
export class ModulesComponent implements OnInit {

  coreWarning = faExclamationTriangle;
  domeWarning = faExclamationTriangle;
  bodyWarning = faExclamationTriangle;

  @ViewChild('core', { static: false }) coreEl!: ElementRef;
  @ViewChild('dome', { static: false }) domeEl!: ElementRef;
  @ViewChild('body', { static: false }) bodyEl!: ElementRef;

  coreModule!: ControlModule;
  domeModule!: ControlModule;
  bodyModule!: ControlModule;

  coreStatus: string;
  domeStatus: string;
  bodyStatus: string; 

  private coreWarningVis: boolean;
  private domeWarningVis: boolean;
  private bodyWarningVis: boolean;

  private coreColor: string;
  private domeColor: string;
  private bodyColor: string;

  private notSynced = "Not Synced";
  private moduleDown = "Module Down";

  constructor(private controllerService: ControllerService,
    private snackBar: MatSnackBar,
    private renderer: Renderer2,
    private socket: WebsocketService) {

    this.coreModule = new ControlModule(ControllerType.core, 'Core Dome Module', '');
    this.domeModule = new ControlModule(ControllerType.dome, 'Outer Dome Module', '');
    this.bodyModule = new ControlModule(ControllerType.body, 'Body Module', '');

    this.coreStatus = 'Pending...';
    this.domeStatus = 'Pending...';
    this.bodyStatus = 'Pending...'; 

    this.coreWarningVis = false;
    this.domeWarningVis = false;
    this.bodyWarningVis = false;

    this.coreColor = 'grey';
    this.domeColor = 'grey';
    this.bodyColor = 'grey';
  }

  ngOnInit(): void {
    const observer = {
      next: (result: any) => this.parseModules(result),
      error: (err: any) => console.error(err)
    };

    this.socket.messages.subscribe((msg: any) => {
      if (msg.type === 'status') {
        this.statusUpdate(msg);
      }
    });

    this.controllerService.getControllers().subscribe(observer);

  }

  saveModuleSettings() {
    const observer = {
      next: (result: any) => {
        if (result.message === 'success') {
          console.log('module settings saved!')
          this.snackBar.open('Module settings saved!', 'OK', { duration: 2000 });
        } else {
          console.log('module settings save failed!', 'OK', { duration: 2000 })
          this.snackBar.open('Module settings save failed!', 'OK', { duration: 2000 });
        }
      },
      error: (err: any) => {
        console.error(err);
        this.snackBar.open('Module settings save failed!');
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
          this.snackBar.open('Module sync queued!', 'OK', { duration: 2000 });
        } else {
            console.log('module sync failed to queue')
            this.snackBar.open(`Module sync failed to queue.`, 'OK', { duration: 2000 });
        }
      },
      error: (err: any) => {
        console.error(err);
        this.snackBar.open('Module sync failed!', 'OK', {duration: 2000});
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

  statusUpdate(message: any) {
    {
      switch (message.module) {
        case 'core':
          this.coreWarningVis = this.updateUi(message.status === 'up', message.synced, this.coreWarningVis, this.coreEl);
          this.coreColor = this.setColor(message.status === 'up', message.synced, this.coreColor, this.coreEl);
          if (message.status !== 'up'){
            this.coreStatus = this.moduleDown;
          } else if (!message.synced){
            this.coreStatus = this.notSynced;
          }
          break;
        case 'dome':
          this.domeWarningVis = this.updateUi(message.status === 'up', message.synced, this.domeWarningVis, this.domeEl);
          this.domeColor = this.setColor(message.status === 'up', message.synced, this.domeColor, this.domeEl);
          if (message.status !== 'up'){
            this.domeStatus = this.moduleDown;
          } else if (!message.synced){
            this.domeStatus = this.notSynced;
          }
          break;
        case 'body':
          this.bodyWarningVis = this.updateUi(message.status === 'up', message.synced, this.bodyWarningVis, this.bodyEl);
          this.bodyColor = this.setColor(message.status === 'up', message.synced, this.bodyColor, this.bodyEl);
          if (message.status !== 'up'){
            this.bodyStatus = this.moduleDown;
          } else if (!message.synced){
            this.bodyStatus = this.notSynced;
          }
          break;
        case 'legs':
          break;
      }
    }
  }

  private setColor(up: boolean, synced: boolean, color: string, el: ElementRef) : string{
    if (!up) {
      if (color !== 'red') {
        this.renderer.setStyle(el.nativeElement, 'color', 'red');
      }
      return 'red'; 
    } else if (!synced && color != 'yellow') {
      this.renderer.setStyle(el.nativeElement, 'color', 'yellow');
      return 'yellow';
    }
    return 'red';
  }

  private updateUi(up: boolean, synced: boolean, visible: boolean, el: ElementRef): boolean {
    if (up && synced) {
      if (visible) {
        this.renderer.setStyle(el.nativeElement, 'visibility', 'hidden');
      }
      return false;
    } else {
      if (!visible) {
        this.renderer.setStyle(el.nativeElement, 'visibility', 'visible');
      }
    }
    return true;
  }
}
