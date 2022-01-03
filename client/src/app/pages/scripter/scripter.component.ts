import { Component, ComponentFactoryResolver, OnInit, Renderer2, ViewChild, ViewContainerRef } from '@angular/core';
import { MatMenuTrigger } from '@angular/material/menu'
import { MatSnackBar } from '@angular/material/snack-bar';
import { ActivatedRoute } from '@angular/router';
import { Guid } from 'guid-typescript';
import { ModalBaseComponent, ModalService } from 'src/app/modal';
import { ChannelType, ControllerType, ControlModule } from 'src/app/models/control_module/control_module';
import { I2cChannel } from 'src/app/models/control_module/i2c_channel';
import { PwmChannel, PwmType } from 'src/app/models/control_module/pwm_channel';
import { UartModule } from 'src/app/models/control_module/uart_module';
import { ChannelValue, ScriptResources } from 'src/app/models/script-resources';
import { Script } from 'src/app/models/scripts/script';
import { ScriptChannel } from 'src/app/models/scripts/script_channel';
import { ScriptEvent } from 'src/app/models/scripts/script_event';
import { ControllerService } from 'src/app/services/controllers/controller.service';
import { ScriptsService } from 'src/app/services/scripts/scripts.service';
import { ControllerModalComponent } from './modals/controller-modal/controller-modal.component';
import { ModalCallbackEvent, ModalResources } from './modals/modal-resources';


export interface Item {
  timeline: string;
  xPos: number;
}

@Component({
  selector: 'app-scripter',
  templateUrl: './scripter.component.html',
  styleUrls: ['./scripter.component.scss']
})
export class ScripterComponent implements OnInit {

  @ViewChild(MatMenuTrigger) menuTrigger!: MatMenuTrigger;

  @ViewChild('modalContainer', {read: ViewContainerRef}) container!: ViewContainerRef;
 // (modalCallback)="modalCallback($event)"
 //[resources]="modalResources"

  private segmentWidth: number = 60;
  private seconds: number = 300;
  private scriptId: string;
  private resourcesLoaded: boolean = false;

  script!: Script;
  scriptChannels: Array<ScriptChannel>;

  timeLineArray: Array<number>;
  menuTopLeft = { x: 0, y: 0 };

  scriptResources!: ScriptResources;

  
  components: Array<any>;
  
  constructor(private route: ActivatedRoute, 
    private snackBar: MatSnackBar,
    private modalService: ModalService, 
    private renderer: Renderer2,
    private controllerService: ControllerService, 
    private scriptService: ScriptsService) {

    this.scriptId = this.route.snapshot.paramMap.get('id') ?? '0';

    this.timeLineArray = Array.from({ length: this.seconds }, (_, i) => i + 1)

    this.scriptChannels = new Array<ScriptChannel>();
    this.components = new Array<any>();
  }

  ngOnInit(): void {
    const csObserver = {
      next: (result: ControlModule[]) => {
        this.scriptResources = new ScriptResources(result);
        this.resourcesLoaded = true;
      },
      error: (err: any) => console.error(err)
    };

    this.controllerService.getControllers().subscribe(csObserver);

    if (this.scriptId === '0') {
      this.scriptId = Guid.create().toString();
      this.script = new Script(this.scriptId, "",
      "", "1970-01-01 00:00:00.000", 
      false, "1970-01-01 00:00:00.000", 
      false, "1970-01-01 00:00:00.000",
      false, "1970-01-01 00:00:00.000");
    } 
    else {

      const ssObserver = {
        next: async (result: Script) => {
          this.script = result;
          this.scriptChannels = this.script.scriptChannels;

          if (!this.resourcesLoaded) {
            await new Promise(f => setTimeout(f, 1000));
          }

          this.scriptResources.applyScript(this.script);
        },
        error: (err: any) => console.error(err)
      };

      this.scriptService.getScript(this.scriptId).subscribe(ssObserver)
    }
  }

  saveScript() {

    const observer = {
      next: (result: any) => {
        if (result.message === 'success') {
          console.log('script settings saved!')
          this.snackBar.open('Script settings saved!', 'OK', { duration: 2000 });
        } else {
          console.log('script settings save failed!', 'OK', { duration: 2000 })
          this.snackBar.open('Script settings save failed!', 'OK', { duration: 2000 });
        }
      },
      error: (err: any) => {
        console.error(err);
        this.snackBar.open('Script settings save failed!');
      }
    };

    this.scriptService.saveScript(this.script).subscribe(observer);
  }


  openChannelAddModal(){
    this.container.clear();

    const modalResources = new Map<string, any>();

    modalResources.set(ModalResources.controllers, this.scriptResources.controllers);
    modalResources.set(ModalResources.modules, this.scriptResources.getAvailableModules());
    modalResources.set(ModalResources.channels, this.scriptResources.getAvailableChannels());
 
    const component = this.container.createComponent(ControllerModalComponent);

    component.instance.resources = modalResources;
    component.instance.modalCallback.subscribe((evt: any) =>{
      this.modalCallback(evt);
    });
    this.components.push(component);

    this.modalService.open('scripter-modal');
  }

  modalCallback(evt: any){

    switch (evt.id) {
      case ModalCallbackEvent.addChannel:
        this.addChannel(evt.controller, evt.module, evt.channel);
        break;
    }

    this.modalService.close('scripter-modal');
    this.container.clear();
    this.components.splice(0, this.components.length);
  }

  timelineCallback(msg: any) {

    msg.event.preventDefault();

    this.menuTopLeft.x = msg.event.clientX;
    this.menuTopLeft.y = msg.event.clientY;

    this.menuTrigger.menuData = { 'item': { 'timeline': msg.id, 'xPos': msg.event.clientX } };

    this.menuTrigger.openMenu();
  }

  removeCallback(msg: any) {

    let chIdx = this.scriptChannels
      .map((ch) => { return ch.id })
      .indexOf(msg.id);

    if (chIdx !== undefined) {
      const channel = this.scriptChannels[chIdx];

      this.scriptChannels.splice(chIdx, 1);

      this.scriptResources.removeChannel(
        channel.controllerType,
        channel.type,
        channel.channel?.id
      );
    }
  }

  addChannel(controller: ControllerType, module: ChannelType, channel: number): void {

    let name = this.scriptResources.controllers.get(controller)?.name;

    if (!name) {
      name = ''
    }

    const chValue = this.scriptResources.addChannel(controller, module, channel);

    const ch = new ScriptChannel(Guid.create().toString(), controller, name, module, channel, chValue, this.seconds);

    this.scriptChannels.unshift(ch);
  }

  onAddEvent(item: any): void {

    let chIdx = this.scriptChannels
    .map((ch) => { return ch.id })
    .indexOf(item.timeline);

    const line = document.getElementById(`script-row-${item.timeline}`);
    const scrollContainer = document.getElementById("scripter-container");

    if (line != null && scrollContainer != null) {

      const clickPos = (item.xPos + scrollContainer.scrollLeft - line.offsetLeft);

      let time = Math.floor(clickPos / this.segmentWidth);

      let left = (time * this.segmentWidth);

      if (Math.floor(clickPos) - left >= 30) {
        time += 1
      }

      const floater = this.renderer.createElement('div');
      const text = this.renderer.createText(time.toString());
      this.renderer.appendChild(floater, text);
      this.renderer.setAttribute(floater, 'class', 'scripter-timeline-marker');
      this.renderer.setStyle(floater, 'top', `0px`);
      this.renderer.setStyle(floater, 'left', `${(time * this.segmentWidth) - 30}px`);
      this.renderer.appendChild(line, floater);

      const event = new ScriptEvent(Guid.create().toString(), item.timeline, time, "{}")

      this.scriptChannels[chIdx].events.push(event);
    }
  }
}
