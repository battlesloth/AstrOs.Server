import {
  AfterViewChecked,
  Component,
  ComponentRef,
  OnInit,
  Renderer2,
  ViewChild,
  ViewContainerRef,
} from '@angular/core';
import {
  MatMenuTrigger,
  MatMenu,
  MatMenuContent,
  MatMenuItem,
} from '@angular/material/menu';
import { ActivatedRoute } from '@angular/router';
import { Guid } from 'guid-typescript';
import { ScriptResources } from 'src/app/models/script-resources';
import {
  ChannelSubType,
  ChannelType,
  AstrOsLocationCollection,
  Script,
  ScriptChannel,
  ScriptEvent,
  ControllerLocation,
  BaseChannel,
} from 'astros-common';
import EventMarkerHelper from './helper/event-marker-helper';
import { FormsModule } from '@angular/forms';
import { NgFor } from '@angular/common';
import { ScriptRowComponent } from './script-row/script-row.component';
import {
  AudioEventModalComponent,
  ChannelTestModalComponent,
  ChannelTestModalResources,
  ChannelTestModalResponse,
  ControllerModalComponent,
  ControllerModalResources,
  ControllerModalResponse,
  GpioEventModalComponent,
  GpioEventModalResources,
  HcrModalResources,
  HumanCyborgModalComponent,
  I2cEventModalComponent,
  I2cEventModalResources,
  KangarooEventModalComponent,
  KangarooEventModalResources,
  ScriptEventModalResources,
  ScriptEventModalResponse,
  ScriptTestModalComponent,
  ScriptTestModalResources,
  UartEventModalComponent,
  UartEventModalResources,
} from '@src/components/modals/scripting';
import { 
  ControllerService,
  ModalService, 
  ScriptsService, 
  SnackbarService 
} from '@src/services';
import {
  ConfirmModalComponent,
  ConfirmModalEvent,
  ConfirmModalResources,
  ModalComponent,
} from '@src/components/modals';
import { ModalCallbackEvent } from '../../components/modals/modal-base/modal-callback-event';

export interface Item {
  timeline: string;
  xPos: number;
}

type ScripterModal =
  | UartEventModalComponent
  | KangarooEventModalComponent
  | I2cEventModalComponent
  | AudioEventModalComponent
  | GpioEventModalComponent
  | HumanCyborgModalComponent;

@Component({
  selector: 'app-scripter',
  templateUrl: './scripter.component.html',
  styleUrls: ['./scripter.component.scss'],
  imports: [
    FormsModule,
    NgFor,
    ScriptRowComponent,
    MatMenuTrigger,
    MatMenu,
    MatMenuContent,
    MatMenuItem,
    ModalComponent,
  ],
})
export class ScripterComponent implements OnInit, AfterViewChecked {
  @ViewChild(MatMenuTrigger) menuTrigger!: MatMenuTrigger;

  @ViewChild('modalContainer', { read: ViewContainerRef })
  container!: ViewContainerRef;

  private segmentWidth = 60;
  private segments = 3000;
  private segmentFactor = 10;
  private scriptId: string;
  private resourcesLoaded = false;
  private renderedEvents = false;
  private characters =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  private removeChannelEvent = 'scripter_removeChannel';

  backgroundClickDisabled = '0';

  script!: Script;
  scriptChannels: ScriptChannel[];

  timeLineArray: number[];
  menuTopLeft = { x: 0, y: 0 };

  scriptResources!: ScriptResources;

  components: unknown[];

  constructor(
    private route: ActivatedRoute,
    private snackBar: SnackbarService,
    private modalService: ModalService,
    private renderer: Renderer2,
    private controllerService: ControllerService,
    private scriptService: ScriptsService,
  ) {
    this.scriptId = this.route.snapshot.paramMap.get('id') ?? '0';

    this.timeLineArray = Array.from(
      { length: this.segments },
      (_, i) => (i + 1) / this.segmentFactor,
    );

    this.scriptChannels = new Array<ScriptChannel>();
    this.components = new Array<unknown>();
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

        if (result.domeModule) modules.push(result.domeModule);
        if (result.coreModule) modules.push(result.coreModule);
        if (result.bodyModule) modules.push(result.bodyModule);

        this.scriptResources = new ScriptResources(modules);
        this.resourcesLoaded = true;
      },
      error: (err: unknown) => console.error(err),
    };

    this.controllerService.getLoadedLocations().subscribe(csObserver);

    if (this.scriptId === '0') {
      this.scriptId = this.generateScriptId(5);
      console.log(`new script id:${this.scriptId}`);
      this.script = new Script(
        this.scriptId,
        '',
        '',
        new Date(Date.parse('1970-01-01 00:00:00.000')),
      );

      this.scriptChannels = this.script.scriptChannels;
    } else {
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
            await new Promise((f) => setTimeout(f, 1000));
          }

          this.scriptResources.applyScript(this.script);
        },
        error: (err: unknown) => console.error(err),
      };

      this.scriptService.getScript(this.scriptId).subscribe(ssObserver);
    }
  }

  saveScript() {
    const observer = {
      next: (result: unknown) => {
        if (result && typeof result === 'object' && 'message' in result) {
          if (result.message === 'success') {
            console.log('script settings saved!');
            this.snackBar.okToast('Script settings saved!');
          }
        } else {
          console.log('script settings save failed!');
          this.snackBar.okToast('Script settings save failed!');
        }
      },
      error: (err: unknown) => {
        console.error(err);
        this.snackBar.okToast('Script settings save failed!');
      },
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

    const modalResources = new Map<string, unknown>();

    modalResources.set(ScriptTestModalResources.scriptId, this.scriptId);

    const locations = new Array<string>();

    this.script.deploymentStatusKvp.forEach((kvp) => {
      locations.push(kvp.key);
    });

    modalResources.set(ScriptTestModalResources.locations, locations);

    const component = this.container.createComponent(ScriptTestModalComponent);

    component.instance.resources = modalResources;
    component.instance.modalCallback.subscribe((evt: ModalCallbackEvent) => {
      this.modalCallback(evt);
    });
    this.components.push(component);

    this.backgroundClickDisabled = '1';

    this.modalService.open('scripter-modal');
  }

  saveBeforeTest() {
    const observer = {
      next: (result: unknown) => {
        if (result && typeof result === 'object' && 'message' in result) {
          if (result.message === 'success') {
            console.log('script settings saved!');
            this.openScriptTestModal();
          }
        } else {
          console.log('script settings save failed!');
          this.snackBar.okToast('Script settings save failed!');
        }
      },
      error: (err: unknown) => {
        console.error(err);
        this.snackBar.okToast('Script settings save failed!');
      },
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

  sendChannelTest(
    controllerId: number,
    commandType: ChannelType,
    command: unknown,
  ) {
    const observer = {
      next: (result: unknown) => {
        if (result && typeof result === 'object' && 'message' in result) {
          if (result.message === 'success') {
            console.log('Test command sent!');
            this.snackBar.okToast('Test command sent!');
          }
        } else {
          console.log('Test command send failed!');
          this.snackBar.okToast('Test command send failed!');
        }
      },
      error: (err: unknown) => {
        console.error(err);
        this.snackBar.okToast('Test command send failed!');
      },
    };

    this.controllerService
      .sendControllerCommand(controllerId, commandType, command)
      .subscribe(observer);
  }

  //#endregion

  openChannelAddModalKbd($event: KeyboardEvent) {
    if (
      $event.key === 'a' ||
      $event.key === 'A' ||
      $event.key === 'Enter' ||
      $event.key === ' '
    ) {
      this.openChannelAddModal();
    }
  }

  openChannelAddModal() {
    this.container.clear();

    const modalResources = new Map<string, unknown>();

    modalResources.set(
      ControllerModalResources.controllers,
      this.scriptResources.locations,
    );
    modalResources.set(
      ControllerModalResources.modules,
      this.scriptResources.getAvailableModules(),
    );
    modalResources.set(
      ControllerModalResources.channels,
      this.scriptResources.getAvailableChannels(),
    );

    const component = this.container.createComponent(ControllerModalComponent);

    component.instance.resources = modalResources;
    component.instance.modalCallback.subscribe((evt: ModalCallbackEvent) => {
      this.modalCallback(evt);
    });
    this.components.push(component);

    this.modalService.open('scripter-modal');
  }

  openNewEventModal(evt: unknown) {
    let time = 0;

    if (evt && typeof evt === 'object' && 'timeline' in evt && 'xPos' in evt) {
      const line = document.getElementById(`script-row-${evt.timeline}`);
      const scrollContainer = document.getElementById('scripter-container');

      if (line != null && scrollContainer != null) {
        const clickPos =
          (evt.xPos as number) + scrollContainer.scrollLeft - line.offsetLeft;

        time = Math.floor(clickPos / this.segmentWidth);

        const left = time * this.segmentWidth;

        if (Math.floor(clickPos) - left >= 30) {
          time += 1;
        }
      } else {
        this.snackBar.okToast('Could not determine event time!');
        console.log('could not determine event time');
        return;
      }

      const chIdx = this.scriptChannels
        .map((ch) => {
          return ch.id;
        })
        .indexOf(evt.timeline as string);

      const ch = this.scriptChannels[chIdx];

      const event = new ScriptEvent(ch.id, ch.type, ch.subType, time, '');

      this.createEventModal(event, false);
    }
  }

  openEditEventModal(channelId: string, time: number) {
    const chIdx = this.scriptChannels
      .map((ch) => {
        return ch.id;
      })
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

    const modalResources = new Map<string, unknown>();
    modalResources.set(ScriptEventModalResources.scriptEvent, event);

    if (isEdit) {
      modalResources.set(
        ScriptEventModalResources.callbackType,
        ScriptEventModalResources.editEvent,
      );
    }

    let component!: ComponentRef<ScripterModal>;

    switch (event.channelType) {
      case ChannelType.uart:
        switch (event.channelSubType) {
          case ChannelSubType.genericSerial:
            component = this.container.createComponent(UartEventModalComponent);
            modalResources.set(
              UartEventModalResources.channelId,
              this.getUartChannelFromChannel(event.scriptChannel),
            );
            break;
          case ChannelSubType.kangaroo:
            component = this.container.createComponent(
              KangarooEventModalComponent,
            );
            modalResources.set(
              KangarooEventModalResources.channelId,
              this.getUartChannelFromChannel(event.scriptChannel),
            );
            modalResources.set(
              KangarooEventModalResources.kangaroo,
              this.getKangarooControllerFromChannel(event.scriptChannel),
            );
            break;
          case ChannelSubType.humanCyborgRelations:
            component = this.container.createComponent(
              HumanCyborgModalComponent,
            );
            modalResources.set(
              HcrModalResources.channelId,
              this.getUartChannelFromChannel(event.scriptChannel),
            );
            break;
        }
        break;
      case ChannelType.i2c:
        component = this.container.createComponent(I2cEventModalComponent);
        modalResources.set(
          I2cEventModalResources.i2cId,
          this.getIdFromChannel(event.scriptChannel),
        );
        break;
      /* case ChannelType.servo:
         component = this.container.createComponent(ServoEventModalComponent);
         modalResources.set(ModalResources.servoId, this.getIdFromChannel(event.scriptChannel))
         break; */
      case ChannelType.audio:
        component = this.container.createComponent(AudioEventModalComponent);
        break;
      case ChannelType.gpio:
        component = this.container.createComponent(GpioEventModalComponent);
        modalResources.set(
          GpioEventModalResources.gpioId,
          this.getIdFromChannel(event.scriptChannel),
        );
        break;
    }

    component.instance.resources = modalResources;
    component.instance.modalCallback.subscribe((evt: ModalCallbackEvent) => {
      this.modalCallback(evt);
    });
    this.components.push(component);

    this.modalService.open('scripter-modal');
  }

  //#region resources for modals

  getUartChannelFromChannel(channelId: string) {
    const _ = this.scriptChannels
      .map((ch) => {
        return ch.id;
      })
      .indexOf(channelId);

    /*if (chIdx > -1) {
      const uart = this.scriptChannels[chIdx].channel as UartChannel;
      return uart.id;
    }*/
  }

  getKangarooControllerFromChannel(channelId: string) {
    const _ = this.scriptChannels
      .map((ch) => {
        return ch.id;
      })
      .indexOf(channelId);

    /*if (chIdx > -1) {
      const uart = this.scriptChannels[chIdx].channel as UartChannel;
      return uart.module as KangarooController;
    }*/
  }

  getIdFromChannel(channelId: string): number | null {
    const chIdx = this.scriptChannels
      .map((ch) => {
        return ch.id;
      })
      .indexOf(channelId);

    if (chIdx > -1) {
      const servo = this.scriptChannels[chIdx].channel as BaseChannel;
      return servo.id;
    }

    return null;
  }

  //#endregion

  modalCallback(evt: ModalCallbackEvent) {
    switch (evt.type) {
      case ControllerModalResources.addChannelEvent: {
        const value = evt.value as ControllerModalResponse;
        this.addChannel(value.controller, value.module, value.channels);
        break;
      }
      case ConfirmModalResources.confirmEvent:
        this.handleConfirmModalEvent(evt.value as ConfirmModalEvent);
        break;
      case ScriptEventModalResources.addEvent: {
        this.addEvent(evt.value as ScriptEvent);
        break;
      }
      case ScriptEventModalResources.editEvent: {
        const value = evt.value as ScriptEventModalResponse;
        this.editEvent(value.scriptEvent, value.time);
        break;
      }
      case ScriptEventModalResources.removeEvent: {
        const value = evt.value as ScriptEventModalResponse;
        this.removeEvent(value.scriptEvent.scriptChannel, value.time);
        break;
      }
      case ChannelTestModalResources.channelTest: {
        const value = evt.value as ChannelTestModalResponse;
        this.sendChannelTest(
          value.controllerId,
          value.commandType,
          value.command,
        );
        break;
      }
    }

    this.modalService.close('scripter-modal');
    this.container.clear();
    this.components.splice(0, this.components.length);
    this.backgroundClickDisabled = '0';
  }

  handleConfirmModalEvent(evt: ConfirmModalEvent) {
    switch (evt.id) {
      case this.removeChannelEvent:
        this.removeChannel(evt.val as string);
        break;
    }
  }

  //#region script row call backs

  timelineCallback(msg: any) {
    msg.event.preventDefault();

    this.menuTopLeft.x = msg.event.clientX;
    this.menuTopLeft.y = msg.event.clientY;

    this.menuTrigger.menuData = {
      item: { timeline: msg.id, xPos: msg.event.clientX },
    };

    this.menuTrigger.openMenu();
  }

  removeCallback(msg: string) {
    this.container.clear();

    const modalResources = new Map<string, unknown>();
    modalResources.set(ConfirmModalResources.action, 'Delete');
    modalResources.set(
      ConfirmModalResources.message,
      'Are you sure you want to delete channel?',
    );
    modalResources.set(ConfirmModalResources.confirmEvent, {
      id: this.removeChannelEvent,
      val: msg,
    });

    const component = this.container.createComponent(ConfirmModalComponent);

    component.instance.resources = modalResources;
    component.instance.modalCallback.subscribe((evt: ModalCallbackEvent) => {
      this.modalCallback(evt);
    });

    this.components.push(component);

    this.modalService.open('scripter-modal');
  }

  private removeChannel(id: string) {
    const chIdx = this.scriptChannels
      .map((ch) => {
        return ch.id;
      })
      .indexOf(id);

    if (chIdx !== undefined && chIdx > -1) {
      const channel = this.scriptChannels[chIdx];

      this.scriptChannels.splice(chIdx, 1);

      this.scriptResources.removeChannel(
        channel.locationId,
        channel.type,
        channel.channel?.id,
      );

      this.scriptChannels.sort((a, b) => this.channelCompare(a, b));
    }
  }

  channelTestCallback(msg: string) {
    const chIdx = this.scriptChannels
      .map((ch) => {
        return ch.id;
      })
      .indexOf(msg);

    if (chIdx !== undefined && chIdx > -1) {
      const ch = this.scriptChannels[chIdx];

      this.container.clear();

      const modalResources = new Map<string, unknown>();

      modalResources.set(ChannelTestModalResources.channelType, ch.type);
      modalResources.set(ChannelTestModalResources.channelSubType, ch.subType);
      modalResources.set(ChannelTestModalResources.channelId, ch.channelNumber);
      modalResources.set(ChannelTestModalResources.controller, ch.locationId);

      const component = this.container.createComponent(
        ChannelTestModalComponent,
      );

      component.instance.resources = modalResources;
      component.instance.modalCallback.subscribe((evt: ModalCallbackEvent) => {
        this.modalCallback(evt);
      });
      this.components.push(component);

      this.modalService.open('scripter-modal');
    }
  }

  //#endregion

  private addChannel(
    locationId: number,
    channelType: ChannelType,
    channels: number[],
  ): void {
    let name = this.scriptResources.locations.get(locationId)?.name;

    if (!name) {
      name = '';
    }

    if (channelType === ChannelType.audio) {
      const chValue = this.scriptResources.addChannel(
        locationId,
        channelType,
        0,
      );

      const subType = 0;

      const ch = new ScriptChannel(
        Guid.create().toString(),
        this.scriptId,
        locationId,
        channelType,
        subType,
        0,
        chValue,
        this.segments,
      );

      this.scriptChannels.push(ch);
    } else {
      channels.forEach((channel) => {
        const chValue = this.scriptResources.addChannel(
          locationId,
          channelType,
          +channel,
        );

        if (chValue === undefined) {
          return;
        }
        let subType = ChannelSubType.none;

        if (channelType === ChannelType.uart) {
          subType = chValue.subType;
        }

        const ch = new ScriptChannel(
          Guid.create().toString(),
          this.scriptId,
          locationId,
          channelType,
          subType,
          channel,
          chValue,
          this.segments,
        );

        this.scriptChannels.push(ch);
      });
    }

    this.scriptChannels.sort((a, b) => this.channelCompare(a, b));
  }

  private addEvent(event: ScriptEvent): void {
    const chIdx = this.scriptChannels
      .map((ch) => {
        return ch.id;
      })
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

  private renderEvent(event: ScriptEvent) {
    //channelId: string, time: number) {
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
    this.renderer.setAttribute(
      floater,
      'id',
      `event-${event.scriptChannel}-${event.time}`,
    );
    this.renderer.setStyle(floater, 'top', `-5px`);
    this.renderer.setStyle(
      floater,
      'left',
      `${event.time * this.segmentWidth - 37}px`,
    );
    this.renderer.listen(floater, 'click', (_) => {
      this.openEditEventModal(event.scriptChannel, event.time);
    });
    this.renderer.appendChild(line, floater);
  }

  private removeEvent(channelId: string, time: number) {
    const chIdx = this.scriptChannels
      .map((ch) => {
        return ch.id;
      })
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
    const charactersLength = this.characters.length;
    for (let i = 0; i < length; i++) {
      result += this.characters.charAt(
        Math.floor(Math.random() * charactersLength),
      );
    }
    return result;
  }
}
