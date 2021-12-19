import { Component, OnInit, Renderer2, ViewChild } from '@angular/core';
import { MatMenuTrigger } from '@angular/material/menu'
import { Guid } from 'guid-typescript';
import { ChannelType, ControllerType, ControlModule, I2cChannel, PwmChannel, PwmType, UartModule } from 'src/app/models/control-module';
import { ScriptChannel, ScriptChannelType, ScriptEvent } from 'src/app/models/script-channel';
import { ChannelValue, ScriptResources } from 'src/app/models/script-resources';
import { ControllerService } from 'src/app/services/controllers/controller.service';
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

  private segmentWidth: number = 60;
  private seconds: number = 300;
  timeLineArray: Array<number>;
  menuTopLeft = { x: 0, y: 0 };

  scriptResources!: ScriptResources;

  selectedController: ControllerType = ControllerType.none;

  availableModules: Map<string, string>;
  selectedModule: string = '';

  availableChannels: Array<ChannelValue>;
  selectedChannel: number = -1;

  scriptChannels: Array<ScriptChannel>;

  constructor(private modalService: ModalService, private renderer: Renderer2,
    private modulesService: ControllerService) {

    this.timeLineArray = Array.from({ length: this.seconds }, (_, i) => i + 1)

    this.availableModules = new Map<string, string>([
      ['uart', 'UART Module'],
      ['pwm', 'PWM Module'],
      ['i2c', 'I2C Module']]);

    this.availableChannels = new Array<ChannelValue>();

    this.scriptChannels = new Array<ScriptChannel>(
      new ScriptChannel(Guid.create().toString(), ControllerType.core, 'Dome Core Controller', ScriptChannelType.Pwm,
        new PwmChannel(2, 'Discombultor', PwmType.linear_servo, 10, 100), this.seconds),
      new ScriptChannel(Guid.create().toString(), ControllerType.dome, 'Dome Skin Controller', ScriptChannelType.I2c,
        new I2cChannel(4, 'A Really Really Long Name Here. Like Really Long'), this.seconds),
      new ScriptChannel(Guid.create().toString(), ControllerType.audio, 'Audio Playback', ScriptChannelType.Sound,
        undefined, this.seconds),
      new ScriptChannel(Guid.create().toString(), ControllerType.body, 'Core Core Controller', ScriptChannelType.Uart,
        new UartModule(), this.seconds));

      this.scriptChannels[0].events.push(new ScriptEvent(4));
      this.scriptChannels[0].events.push(new ScriptEvent(7));
  }

  ngOnInit(): void {
    const observer = {
      next: (result: any) => {
        this.scriptResources = new ScriptResources(result);
      },
      error: (err: any) => console.error(err)
    };

    this.modulesService.getControllers().subscribe(observer);
  }

  openModal(id: string) {
    this.modalService.open(id);
  }

  closeModal(id: string) {
    this.modalService.close(id);
    this.selectedController = ControllerType.none;
    this.selectedModule = '';
    this.selectedChannel = -1;

    document.getElementById('module-select')?.setAttribute('disabled', 'disabled');
    document.getElementById('channel-select')?.setAttribute('disabled', 'disabled');
  }

  timelineCallback(msg: any) {

    msg.event.preventDefault();

    this.menuTopLeft.x = msg.event.clientX;
    this.menuTopLeft.y = msg.event.clientY;

    this.menuTrigger.menuData = { 'item': { 'timeline': msg.id, 'xPos': msg.event.clientX } };

    this.menuTrigger.openMenu();
  }

  removeCallback(msg: any) {

    const chIdx = this.scriptChannels
      .map((ch) => {return ch.id})
      .indexOf(msg.id);

    if (chIdx !== undefined){
      const channel = this.scriptChannels[chIdx];

      this.scriptChannels.splice(chIdx, 1);

      this.scriptResources.removeChannel(
        channel.controllerType,
        channel.type,
        channel.channel.id
      );
    }
  }

  

  modalChange($event: any) {

    // convert from string value to number for enum
    if ($event.target.id === 'controller-select') {
      if (+$event.target.value === ControllerType.audio) {
        this.selectedModule = '';
        this.selectedChannel = -1;
        document.getElementById('module-select')?.setAttribute('disabled', 'disabled');
        document.getElementById('channel-select')?.setAttribute('disabled', 'disabled')
        return
      }
      else {
        document.getElementById('module-select')?.removeAttribute('disabled');
      }
    }
    else if ($event.target.id === 'module-select') {

      switch ($event.target.value) {
        case 'uart':
          this.selectedChannel = -1;
          document.getElementById('channel-select')?.setAttribute('disabled', 'disabled');
          return;
        case 'pwm':
          const pwmChannels = this.scriptResources.pwmChannels.get(+this.selectedController);
          if (pwmChannels) {
            this.availableChannels = Array.from(pwmChannels);
          }
          break
        case 'i2c':
          const i2cChannels = this.scriptResources.i2cChannels.get(+this.selectedController);
          if (i2cChannels) {
            this.availableChannels = Array.from(i2cChannels);
          }
          break;
      }

      document.getElementById('channel-select')?.removeAttribute('disabled');
    }
  }

  addChannel(): void {

    // convert from string value to number for enum
    const controller = +this.selectedController;
    const channel = + this.selectedChannel;

    let name = this.scriptResources.controllers.get(controller)?.name;

    if (!name) {
      name = ''
    }

    let type = ScriptChannelType.None;

    switch (this.selectedModule) {
      case 'uart':
        type = ScriptChannelType.Uart;
        break;
      case 'pwm':
        type = ScriptChannelType.Pwm;
        break;
      case 'i2c':
        type = ScriptChannelType.I2c;
        break;
    }

    const chValue = this.scriptResources.addChannel(controller, type, channel)
    
    this.scriptChannels.push(
      new ScriptChannel(Guid.create().toString(), controller, name, type, chValue, this.seconds)
    );

    this.closeModal('channel-add-modal');
  }

  onAddEvent(item: any): void {

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
    }
  }
}
