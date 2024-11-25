import { AfterViewChecked, Component, OnInit, Renderer2, ViewChild, ViewContainerRef } from '@angular/core';
import { MatMenuTrigger } from '@angular/material/menu'
import { ActivatedRoute } from '@angular/router';
import { Guid } from 'guid-typescript';
import { ConfirmModalComponent, ModalService } from 'src/app/modal';
import { ScriptResources } from 'src/app/models/script-resources';
import { ChannelSubType, ChannelType, I2cChannel, KangarooController, AstrOsLocationCollection, Script, ScriptChannel, ScriptEvent, ServoChannel, ServoModule, UartChannel, UartModule, UartType, ControllerLocation, GpioChannel, Identifiable, BaseChannel } from 'astros-common';
import { ControllerService } from 'src/app/services/controllers/controller.service';
import { ScriptsService } from 'src/app/services/scripts/scripts.service';
import { ControllerModalComponent } from './modals/controller-modal/controller-modal.component';
import { I2cEventModalComponent } from './modals/i2c-event-modal/i2c-event-modal.component';
import { ModalCallbackEvent, ModalResources } from '../../shared/modal-resources';
import { ServoEventModalComponent } from './modals/servo-event-modal/servo-event-modal.component';
import { AudioEventModalComponent } from './modals/audio-event-modal/audio-event-modal.component';
import { KangarooEventModalComponent } from './modals/kangaroo-event-modal/kangaroo-event-modal.component';
import { SnackbarService } from 'src/app/services/snackbar/snackbar.service';
import { ScriptTestModalComponent } from './modals/script-test-modal/script-test-modal.component';
import { ChannelTestModalComponent } from './modals/channel-test-modal/channel-test-modal.component';
import EventMarkerHelper from './helper/event-marker-helper';
import { UartEventModalComponent } from './modals/uart-event-modal/uart-event-modal.component';
import { HumanCyborgModalComponent } from './modals/human-cyborg-modal/human-cyborg-modal.component';
import { GpioEventModalComponent } from './modals/gpio-event-modal/gpio-event-modal.component';


export interface Item {
  timeline: string;
  xPos: number;
}

@Component({
  selector: 'app-scripter',
  templateUrl: './scripter.component.html',
  styleUrls: ['./scripter.component.scss']
})
export class ScripterComponent implements OnInit, AfterViewChecked {

  @ViewChild(MatMenuTrigger) menuTrigger!: MatMenuTrigger;

  @ViewChild('modalContainer', { read: ViewContainerRef }) container!: ViewContainerRef;

  private segmentWidth: number = 60;
  private segments: number = 3000;
  private segmentFactor: number = 10;
  private scriptId: string;
  private resourcesLoaded: boolean = false;
  private renderedEvents: boolean = false;
  private characters: string = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

  backgroundClickDisabled = '0';

  script!: Script;
  scriptChannels: Array<ScriptChannel>;

  timeLineArray: Array<number>;
  menuTopLeft = { x: 0, y: 0 };

  scriptResources!: ScriptResources;


  components: Array<any>;

  constructor(private route: ActivatedRoute,
    private snackBar: SnackbarService,
    private modalService: ModalService,
    private renderer: Renderer2,
    private controllerService: ControllerService,
    private scriptService: ScriptsService) {

    this.scriptId = this.route.snapshot.paramMap.get('id') ?? '0';

    this.timeLineArray = Array.from({ length: this.segments }, (_, i) => (i + 1) / this.segmentFactor)

    this.scriptChannels = new Array<ScriptChannel>();
    this.components = new Array<any>();
  }

  ngAfterViewChecked(): void {
    // "this" needs to exist before we render events
    if (!this.renderedEvents) {
      if (this.script != undefined) {
        for (const ch of this.script.scriptChannels) {
          for (const kvp of ch.eventsKvpArray) {
            this.renderEvent(kvp.value);
          }
        }
        this.renderedEvents = true;
      }
    }
  }

  ngOnInit(): void {
    const csObserver = {
      next: (result: AstrOsLocationCollection) => {

        const modules = new Array<ControllerLocation>();

        if (result.domeModule)
          modules.push(result.domeModule);
        if (result.coreModule)
          modules.push(result.coreModule);
        if (result.bodyModule)
          modules.push(result.bodyModule);

        this.scriptResources = new ScriptResources(modules);
        this.resourcesLoaded = true;
      },
      error: (err: any) => console.error(err)
    };

    this.controllerService.getLoadedLocations().subscribe(csObserver);

    if (this.scriptId === '0') {
      this.scriptId = this.generateScriptId(5);
      console.log(`new script id:${this.scriptId}`);
      this.script = new Script(this.scriptId, "",
        "", new Date(Date.parse("1970-01-01 00:00:00.000")));

      this.scriptChannels = this.script.scriptChannels;
    }
    else {

      const ssObserver = {
        next: async (result: Script) => {

          for (const ch of result.scriptChannels) {
            ch.events = new Map<number, ScriptEvent>();

            for (const kvp of ch.eventsKvpArray) {
              ch.events.set(kvp.key, kvp.value);
            }
          }

          this.script = result;

          this.scriptChannels = this.script.scriptChannels;

          this.scriptChannels.sort((a, b) => this.channelCompare(a, b));

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
          this.snackBar.okToast('Script settings saved!');
        } else {
          console.log('script settings save failed!')
          this.snackBar.okToast('Script settings save failed!');
        }
      },
      error: (err: any) => {
        console.error(err);
        this.snackBar.okToast('Script settings save failed!');
      }
    };

    // Maps don't survive JSON.stringify
    for (const ch of this.script.scriptChannels) {

      ch.eventsKvpArray = [];

      for (const key of ch.events.keys()) {
        ch.eventsKvpArray.push({ key: key, value: ch.events.get(key) });
      }
    }

    this.scriptService.saveScript(this.script).subscribe(observer);
  }

  //#region testing methods

  openScriptTestModal() {
    this.container.clear();

    const modalResources = new Map<string, any>();

    modalResources.set(ModalResources.scriptId, this.scriptId);

    const locations = new Array<string>();

    this.script.deploymentStatusKvp.forEach((kvp) => { locations.push(kvp.key) });

    modalResources.set(ModalResources.locations, locations);

    const component = this.container.createComponent(ScriptTestModalComponent);

    component.instance.resources = modalResources;
    component.instance.modalCallback.subscribe((evt: any) => {
      this.modalCallback(evt);
    });
    this.components.push(component);

    this.backgroundClickDisabled = '1';

    this.modalService.open('scripter-modal');
  }

  saveBeforeTest() {
    const observer = {
      next: (result: any) => {
        if (result.message === 'success') {
          console.log('script settings saved!')
          this.openScriptTestModal();
        } else {
          console.log('script settings save failed!')
          this.snackBar.okToast('Script settings save failed!');
        }
      },
      error: (err: any) => {
        console.error(err);
        this.snackBar.okToast('Script settings save failed!');
      }
    };

    // Maps don't survive JSON.stringify
    for (const ch of this.script.scriptChannels) {

      ch.eventsKvpArray = [];

      for (const key of ch.events.keys()) {
        ch.eventsKvpArray.push({ key: key, value: ch.events.get(key) });
      }
    }

    this.scriptService.saveScript(this.script).subscribe(observer);
  }


  sendChannelTest(controllerId: number, commandType: ChannelType, command: any) {

    const observer = {
      next: (result: any) => {
        if (result.message === 'success') {
          console.log('Test command sent!')
          this.snackBar.okToast('Test command sent!');
        } else {
          console.log('Test command send failed!')
          this.snackBar.okToast('Test command send failed!');
        }
      },
      error: (err: any) => {
        console.error(err);
        this.snackBar.okToast('Test command send failed!');
      }
    };

    this.controllerService.sendControllerCommand(controllerId, commandType, command)
      .subscribe(observer);
  }

  //#endregion

  openChannelAddModal() {

    this.container.clear();

    const modalResources = new Map<string, any>();

    modalResources.set(ModalResources.controllers, this.scriptResources.locations);
    modalResources.set(ModalResources.modules, this.scriptResources.getAvailableModules());
    modalResources.set(ModalResources.channels, this.scriptResources.getAvailableChannels());

    const component = this.container.createComponent(ControllerModalComponent);

    component.instance.resources = modalResources;
    component.instance.modalCallback.subscribe((evt: any) => {
      this.modalCallback(evt);
    });
    this.components.push(component);

    this.modalService.open('scripter-modal');
  }

  openNewEventModal(evt: any) {
    let time = 0;

    const line = document.getElementById(`script-row-${evt.timeline}`);
    const scrollContainer = document.getElementById("scripter-container");

    if (line != null && scrollContainer != null) {

      const clickPos = (evt.xPos + scrollContainer.scrollLeft - line.offsetLeft);

      time = Math.floor(clickPos / this.segmentWidth);

      let left = (time * this.segmentWidth);

      if (Math.floor(clickPos) - left >= 30) {
        time += 1
      }
    } else {
      this.snackBar.okToast('Could not determine event time!');
      console.log('could not determine event time');
      return;
    }

    let chIdx = this.scriptChannels
      .map((ch) => { return ch.id })
      .indexOf(evt.timeline);

    const ch = this.scriptChannels[chIdx];

    const event = new ScriptEvent(ch.id, ch.type, ch.subType, time, '');

    this.createEventModal(event, false);

  }

  openEditEventModal(channelId: string, time: number) {
    const chIdx = this.scriptChannels
      .map((ch) => { return ch.id })
      .indexOf(channelId);

    if (chIdx > -1) {
      const event = this.scriptChannels[chIdx].events.get(time);

      if (event) {
        this.createEventModal(event, true);
      }
    }
  }

  createEventModal(event: ScriptEvent, isEdit: boolean) {

    this.container.clear();

    const modalResources = new Map<string, any>();
    modalResources.set(ModalResources.scriptEvent, event)

    if (isEdit) {
      modalResources.set(ModalResources.callbackType, ModalCallbackEvent.editEvent);
    }

    let component: any;

    switch (event.channelType) {
      case ChannelType.uart:
        switch (event.channelSubType) {
          case ChannelSubType.genericSerial:
            component = this.container.createComponent(UartEventModalComponent)
            modalResources.set(ModalResources.channelId, this.getUartChannelFromChannel(event.scriptChannel));
            break;
          case ChannelSubType.kangaroo:
            component = this.container.createComponent(KangarooEventModalComponent)
            modalResources.set(ModalResources.channelId, this.getUartChannelFromChannel(event.scriptChannel));
            modalResources.set(ModalResources.kangaroo, this.getKangarooControllerFromChannel(event.scriptChannel));
            break;
          case ChannelSubType.humanCyborgRelations:
            component = this.container.createComponent(HumanCyborgModalComponent)
            modalResources.set(ModalResources.channelId, this.getUartChannelFromChannel(event.scriptChannel));
            break;
        }
        break;
      case ChannelType.i2c:
        component = this.container.createComponent(I2cEventModalComponent);
        modalResources.set(ModalResources.i2cId, this.getIdFromChannel(event.scriptChannel))
        break;
      case ChannelType.servo:
        component = this.container.createComponent(ServoEventModalComponent);
        modalResources.set(ModalResources.servoId, this.getIdFromChannel(event.scriptChannel))
        break;
      case ChannelType.audio:
        component = this.container.createComponent(AudioEventModalComponent);
        break;
      case ChannelType.gpio:
        component = this.container.createComponent(GpioEventModalComponent);
        modalResources.set(ModalResources.gpioId, this.getIdFromChannel(event.scriptChannel))
        break;
    }

    component.instance.resources = modalResources;
    component.instance.modalCallback.subscribe((evt: any) => {
      this.modalCallback(evt);
    });
    this.components.push(component);

    this.modalService.open('scripter-modal');
  }

  //#region resources for modals 

  getUartChannelFromChannel(channelId: string): any {
    const chIdx = this.scriptChannels
      .map((ch) => { return ch.id })
      .indexOf(channelId);

    if (chIdx > -1) {
      const uart = this.scriptChannels[chIdx].channel as UartChannel;
      return uart.id;
    }
  }

  getKangarooControllerFromChannel(channelId: string): any {

    const chIdx = this.scriptChannels
      .map((ch) => { return ch.id })
      .indexOf(channelId);

    if (chIdx > -1) {
      const uart = this.scriptChannels[chIdx].channel as UartChannel;
      return uart.module as KangarooController;
    }
  }

  getIdFromChannel(channelId: string): any {
    const chIdx = this.scriptChannels
      .map((ch) => { return ch.id })
      .indexOf(channelId);

    if (chIdx > -1) {
      const servo = this.scriptChannels[chIdx].channel as BaseChannel;
      return servo.id;
    }
  }


  //#endregion

  modalCallback(evt: any) {

    switch (evt.id) {
      case ModalCallbackEvent.addChannel:
        this.addChannel(evt.controller, evt.module, evt.channels);
        break;
      case ModalCallbackEvent.removeChannel:
        this.removeChannel(evt.val);
        break;
      case ModalCallbackEvent.addEvent:
        this.addEvent(evt.scriptEvent);
        break;
      case ModalCallbackEvent.editEvent:
        this.editEvent(evt.scriptEvent, evt.originalEventTime);
        break;
      case ModalCallbackEvent.removeEvent:
        this.removeEvent(evt.channelId, evt.time);
        break;
      case ModalCallbackEvent.channelTest:
        this.sendChannelTest(evt.controllerId, evt.commandType, evt.command);
    }

    this.modalService.close('scripter-modal');
    this.container.clear();
    this.components.splice(0, this.components.length);
    this.backgroundClickDisabled = '0';
  }

  //#region script row call backs

  timelineCallback(msg: any) {

    msg.event.preventDefault();

    this.menuTopLeft.x = msg.event.clientX;
    this.menuTopLeft.y = msg.event.clientY;

    this.menuTrigger.menuData = { 'item': { 'timeline': msg.id, 'xPos': msg.event.clientX } };

    this.menuTrigger.openMenu();
  }

  removeCallback(msg: any) {

    this.container.clear();

    const modalResources = new Map<string, any>();
    modalResources.set(ModalResources.action, 'Delete')
    modalResources.set(ModalResources.message, 'Are you sure you want to delete channel?');
    modalResources.set(ModalResources.confirmEvent, { id: ModalCallbackEvent.removeChannel, val: msg.id });
    modalResources.set(ModalResources.closeEvent, { id: ModalCallbackEvent.close })

    const component = this.container.createComponent(ConfirmModalComponent);

    component.instance.resources = modalResources;
    component.instance.modalCallback.subscribe((evt: any) => {
      this.modalCallback(evt);
    });

    this.components.push(component);

    this.modalService.open('scripter-modal');
  }

  private removeChannel(id: string) {

    let chIdx = this.scriptChannels
      .map((ch) => { return ch.id })
      .indexOf(id);

    if (chIdx !== undefined && chIdx > -1) {
      const channel = this.scriptChannels[chIdx];

      this.scriptChannels.splice(chIdx, 1);

      this.scriptResources.removeChannel(
        channel.locationId,
        channel.type,
        channel.channel?.id
      );

      this.scriptChannels.sort((a, b) => this.channelCompare(a, b));
    }
  }

  channelTestCallback(msg: any) {

    let chIdx = this.scriptChannels
      .map((ch) => { return ch.id })
      .indexOf(msg.id);

    if (chIdx !== undefined && chIdx > -1) {

      const ch = this.scriptChannels[chIdx];

      this.container.clear();

      const modalResources = new Map<string, any>();

      modalResources.set(ModalResources.channelType, ch.type);
      modalResources.set(ModalResources.channelSubType, ch.subType);
      modalResources.set(ModalResources.channelId, ch.channelNumber);
      modalResources.set(ModalResources.controllerType, ch.locationId);

      const component = this.container.createComponent(ChannelTestModalComponent);

      component.instance.resources = modalResources;
      component.instance.modalCallback.subscribe((evt: any) => {
        this.modalCallback(evt);
      });
      this.components.push(component);

      this.modalService.open('scripter-modal');
    }
  }

  //#endregion

  private addChannel(locationId: number, channelType: ChannelType, channels: Array<number>): void {

    let name = this.scriptResources.locations.get(locationId)?.name;

    if (!name) {
      name = ''
    }

    if (channelType === ChannelType.audio) {
      const chValue = this.scriptResources.addChannel(locationId, channelType, 0);

      let subType = 0;

      const ch = new ScriptChannel(Guid.create().toString(), this.scriptId, locationId, channelType, subType, 0, chValue, this.segments);

      this.scriptChannels.push(ch);
    }
    else {
      channels.forEach(channel => {
        const chValue = this.scriptResources.addChannel(locationId, channelType, +channel);

        let subType = 0;

        if (channelType === ChannelType.uart) {
          subType = chValue.type;
        }

        const ch = new ScriptChannel(Guid.create().toString(), this.scriptId, locationId, channelType, subType, channel, chValue, this.segments);

        this.scriptChannels.push(ch);
      });
    }

    this.scriptChannels.sort((a, b) => this.channelCompare(a, b));
  }

  private addEvent(event: ScriptEvent): void {

    const chIdx = this.scriptChannels
      .map((ch) => { return ch.id })
      .indexOf(event.scriptChannel);

    this.scriptChannels[chIdx].events.set(event.time, event);

    this.renderEvent(event);
  }

  private editEvent(event: ScriptEvent, oldTime: number) {
    //if (event.time !== oldTime) {
    this.removeEvent(event.scriptChannel, oldTime);
    this.addEvent(event);
    // }
    // else {

    //  const chIdx = this.scriptChannels
    //    .map((ch) => { return ch.id })
    //    .indexOf(event.scriptChannel);

    //  this.scriptChannels[chIdx].events.set(event.time, event);
    //}
  }

  private renderEvent(event: ScriptEvent) {//channelId: string, time: number) {
    const line = document.getElementById(`script-row-${event.scriptChannel}`);

    const floater = this.renderer.createElement('div');
    const displayText = EventMarkerHelper.generateText(event);

    const line1 = this.renderer.createElement('div');
    const line1txt = this.renderer.createText(displayText[0]);
    this.renderer.appendChild(line1, line1txt);
    this.renderer.appendChild(floater, line1);

    const line2 = this.renderer.createElement('div');
    const line2txt = this.renderer.createText(displayText[1]);
    this.renderer.appendChild(line2, line2txt);
    this.renderer.appendChild(floater, line2);

    const line3 = this.renderer.createElement('div');
    const line3txt = this.renderer.createText(displayText[2]);
    this.renderer.appendChild(line3, line3txt);
    this.renderer.appendChild(floater, line3);

    const line4 = this.renderer.createElement('div');
    const line4txt = this.renderer.createText(displayText[3]);
    this.renderer.appendChild(line4, line4txt);
    this.renderer.appendChild(floater, line4);

    this.renderer.setAttribute(floater, 'class', 'scripter-timeline-marker');
    this.renderer.setAttribute(floater, 'id', `event-${event.scriptChannel}-${event.time}`)
    this.renderer.setStyle(floater, 'top', `-5px`);
    this.renderer.setStyle(floater, 'left', `${(event.time * this.segmentWidth) - 37}px`);
    this.renderer.listen(floater, 'click', (evt) => {
      this.openEditEventModal(event.scriptChannel, event.time);
    })
    this.renderer.appendChild(line, floater);
  }

  private removeEvent(channelId: string, time: number) {
    const chIdx = this.scriptChannels
      .map((ch) => { return ch.id })
      .indexOf(channelId);

    this.scriptChannels[chIdx].events.delete(time);

    const element = document.getElementById(`event-${channelId}-${time}`);
    if (element) {
      element.parentNode?.removeChild(element);
    }
  }

  private channelCompare(a: ScriptChannel, b: ScriptChannel) {
    let val = a.locationId - b.locationId;

    if (val !== 0) {
      return val;
    }

    val = a.type - b.type;

    if (val !== 0) {
      return val;
    }

    return a.channel.channelName < b.channel.channelName ? -1 : 1;
  }

  private generateScriptId(length: number): string {
    let result = `s${Math.floor(Date.now() / 1000)}`;
    let charactersLength = this.characters.length;
    for (var i = 0; i < length; i++) {
      result += this.characters.charAt(Math.floor(Math.random() * charactersLength));
    }
    return result;
  }
}
