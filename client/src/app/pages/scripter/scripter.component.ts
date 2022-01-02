import { Component, OnInit, Renderer2, ViewChild } from '@angular/core';
import { MatMenuTrigger } from '@angular/material/menu'
import { MatSnackBar } from '@angular/material/snack-bar';
import { ActivatedRoute } from '@angular/router';
import { Guid } from 'guid-typescript';
import { ModalService } from 'src/app/modal';
import { ControllerType, ControlModule } from 'src/app/models/control_module/control_module';
import { I2cChannel } from 'src/app/models/control_module/i2c_channel';
import { PwmChannel, PwmType } from 'src/app/models/control_module/pwm_channel';
import { UartModule } from 'src/app/models/control_module/uart_module';
import { ChannelValue, ScriptResources } from 'src/app/models/script-resources';
import { Script } from 'src/app/models/scripts/script';
import { ScriptChannel, ScriptChannelType } from 'src/app/models/scripts/script_channel';
import { ScriptEvent } from 'src/app/models/scripts/script_event';
import { ControllerService } from 'src/app/services/controllers/controller.service';
import { ScriptsService } from 'src/app/services/scripts/scripts.service';


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
  private scriptId: string;
  private resourcesLoaded: boolean = false;

  script!: Script;

  timeLineArray: Array<number>;
  menuTopLeft = { x: 0, y: 0 };

  scriptResources!: ScriptResources;

  selectedController: ControllerType = ControllerType.none;

  availableModules: Map<string, string>;
  selectedModule: string = '';

  availableChannels: Array<ChannelValue>;
  selectedChannel: number = -1;

  scriptChannels: Array<ScriptChannel>;

  constructor(private route: ActivatedRoute, private snackBar: MatSnackBar,
    private modalService: ModalService, private renderer: Renderer2,
    private controllerService: ControllerService, private scriptService: ScriptsService) {

    this.scriptId = this.route.snapshot.paramMap.get('id') ?? '0';

    this.timeLineArray = Array.from({ length: this.seconds }, (_, i) => i + 1)

    this.availableModules = new Map<string, string>([
      ['uart', 'UART Module'],
      ['pwm', 'PWM Module'],
      ['i2c', 'I2C Module']]);

    this.availableChannels = new Array<ChannelValue>();
    this.scriptChannels = new Array<ScriptChannel>();
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
      this.script = new Script(this.scriptId, "", "", "1970-01-01 00:00:00.000", false, "1970-01-01 00:00:00.000", false, "1970-01-01 00:00:00.000", false, "1970-01-01 00:00:00.000");
    } else {

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

    this.scriptService.saveScript(this.script).subscribe(observer);
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
    const channel = +this.selectedChannel;

    let name = this.scriptResources.controllers.get(controller)?.name;

    if (!name) {
      name = ''
    }

    let type = ScriptChannelType.None;

    if (controller === ControllerType.audio) {
      type = ScriptChannelType.Sound;
    } else {

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
    }

    const chValue = this.scriptResources.addChannel(controller, type, channel)

    const ch = new ScriptChannel(Guid.create().toString(), controller, name, type, channel, chValue, this.seconds)


    this.scriptChannels.unshift(ch);

    this.closeModal('channel-add-modal');
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
