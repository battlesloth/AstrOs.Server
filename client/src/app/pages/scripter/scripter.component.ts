import { KeyValue } from '@angular/common';
import { newArray } from '@angular/compiler/src/util';
import { Component, KeyValueDiffers, OnInit, Renderer2, ViewChild } from '@angular/core';
import { MatMenuTrigger } from '@angular/material/menu'
import { ControlModule } from 'src/app/models/control-module';
import { ScriptChannel, ScriptChannelType } from 'src/app/models/script-channel';
import { ScriptResources } from 'src/app/models/script-resources';
import { ModulesService } from 'src/app/services/modules/modules.service';
import { ModalService } from '../../modal';

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

  private seconds: number = 300;

  scriptResources!: ScriptResources;


  selectedController: string = '';

  availableModules: Map<string, string>;
  selectedModule: string = '';

  availableChannels: Array<number>;
  selectedChannel: number = -1;

  scriptChannels: Array<ScriptChannel>;

  timeLineArray: Array<number>;

  menuTopLeft = { x: 0, y: 0 };

  modules: Map<string, ControlModule>;

  constructor(private modalService: ModalService, private renderer: Renderer2,
    private modulesService: ModulesService,) {

    this.timeLineArray = Array.from({ length: this.seconds }, (_, i) => i + 1)

    this.modules = new Map<string, ControlModule>();
    this.availableModules = new Map<string, string>([
      ['uart', 'UART Module'],
      ['pwm', 'PWM Module'],
      ['i2c', 'I2C Module']]);

    this.availableChannels = new Array<number>(0,1,2);

    this.scriptChannels = new Array<ScriptChannel>(
      new ScriptChannel(1, ScriptChannelType.Pwm, this.seconds)
    );
  }

  ngOnInit(): void {
    const observer = {
      next: (result: any) => {
        this.scriptResources = new ScriptResources(result);
      },
      error: (err: any) => console.error(err)
    };

    this.modulesService.getModules().subscribe(observer);
  }

  openModal(id: string) {
    this.modalService.open(id);
  }

  closeModal(id: string) {
    this.modalService.close(id);
    this.selectedController = '';
    this.selectedModule = '';
    this.selectedChannel = -1;

    document.getElementById('module-select')?.setAttribute('disabled', 'disabled');
    document.getElementById('channel-select')?.setAttribute('disabled', 'disabled');
  }

  timelineCallback(msg: any) {

    msg.event.preventDefault();

    this.menuTopLeft.x = msg.event.clientX;
    this.menuTopLeft.y = msg.event.clientY;

    this.menuTrigger.menuData = { 'item': { 'timeline': msg.id.timeline, 'xPos': msg.event.clientX } };

    this.menuTrigger.openMenu();
  }

  modalChange($event: any) {
    if ($event.target.id === 'controller-select'){
      document.getElementById('module-select')?.removeAttribute('disabled');  
    }
    if ($event.target.id === 'module-select'){
      document.getElementById('channel-select')?.removeAttribute('disabled');  
    }
    var test = $event;
  }

  addChannel(): void {
    this.closeModal('channel-add-modal');

    //this.scriptChannels.push(

    //  new ScriptChannel(2, ScriptChannelType.Uart, 300)
    //);
  }

  onAddEvent(item: any): void {
    const line = document.getElementById(item.timeline);
    const scrollContainer = document.getElementById("scripter-container");

    if (line != null && scrollContainer != null) {

      let left = Math.floor((item.xPos + scrollContainer.scrollLeft - line.offsetLeft) / 41) * 41;

      if (Math.floor(item.xPos - line.offsetLeft) - left > 20) {
        left += 20;
      } else {
        left -= 20;
      }

      const floater = this.renderer.createElement('div');
      this.renderer.setAttribute(floater, 'class', 'scripter-timeline-marker');
      this.renderer.setStyle(floater, 'top', `0px`);
      this.renderer.setStyle(floater, 'left', `${left}px`);
      this.renderer.setStyle(floater, 'width', '40px');
      this.renderer.appendChild(line, floater);
    }
  }
}
