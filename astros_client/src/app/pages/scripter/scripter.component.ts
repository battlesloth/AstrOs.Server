import {
  AfterViewChecked,
  Component,
  ComponentRef,
  ElementRef,
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
import {
  Script,
  ScriptChannel,
  ScriptEvent,
  ModuleType,
  ModuleSubType,
  ScriptChannelType,
  ModuleChannelTypes,
  MaestroChannel,
} from 'astros-common';
import EventMarkerHelper from './helper/event-marker-helper';
import { FormsModule } from '@angular/forms';
import { NgFor, NgIf } from '@angular/common';
import {
  ModuleChannelChangedEvent,
  ScriptRowComponent,
  TimeLineEvent,
} from '@src/components/scripting';
import {
  AudioEventModalComponent,
  ChannelTestModalComponent,
  ChannelTestModalResources,
  ChannelTestModalResponse,
  AddChannelModalComponent,
  AddChannelModalResources,
  AddChannelModalResponse,
  GpioEventModalComponent,
  HumanCyborgModalComponent,
  I2cEventModalComponent,
  KangarooEventModalComponent,
  KangarooEventModalResources,
  ScriptEventModalResources,
  ScriptEventModalResponse,
  ScriptTestModalComponent,
  ScriptTestModalResources,
  UartEventModalComponent,
  ServoEventModalComponent,
  DeploymentLocation
} from '@src/components/modals/scripting';
import {
  ControllerService,
  ModalService,
  ScriptsService,
  SnackbarService,
} from '@src/services';
import {
  ConfirmModalComponent,
  ConfirmModalEvent,
  ConfirmModalResources,
  ModalComponent,
} from '@src/components/modals';
import { ModalCallbackEvent } from '@src/components/modals/modal-base/modal-callback-event';
import { ScriptResourcesService } from '@src/services/script-resources/script-resources.service';
import { ChannelDetails } from '@src/models/scripting';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ScrollingModule } from '@angular/cdk/scrolling'
import { DragDropModule } from '@angular/cdk/drag-drop';

export interface MenuItemDetails {
  timeline: string;
  xPos: number;
}

type ScripterModal =
  | UartEventModalComponent
  | KangarooEventModalComponent
  | I2cEventModalComponent
  | AudioEventModalComponent
  | GpioEventModalComponent
  | HumanCyborgModalComponent
  | ServoEventModalComponent;

@Component({
  selector: 'app-scripter',
  templateUrl: './scripter.component.html',
  styleUrls: ['./scripter.component.scss'],
  imports: [
    FormsModule,
    NgFor,
    NgIf,
    ScriptRowComponent,
    MatMenuTrigger,
    MatMenu,
    MatMenuContent,
    MatMenuItem,
    ModalComponent,
    MatProgressSpinnerModule,
    ScrollingModule,
    DragDropModule,
  ],
})
export class ScripterComponent implements OnInit, AfterViewChecked {
  @ViewChild(MatMenuTrigger)
  menuTrigger!: MatMenuTrigger;

  @ViewChild('modalContainer', { read: ViewContainerRef })
  container!: ViewContainerRef;

  @ViewChild('scripterContainer')
  scripterContainer!: ElementRef;
  isDragging = false;
  dragStartX = 0;
  scrollLeft = 0;
  dragStartY = 0;
  scrollTop = 0;

  private segmentWidth = 60;
  private segments = 3000;
  private segmentFactor = 10;
  private scriptId: string;
  private renderedEvents = false;
  private characters =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  private removeChannelEvent = 'scripter_removeChannel';

  backgroundClickDisabled = '0';

  script!: Script;
  scriptChannels: ScriptChannel[];

  timeLineArray: number[];
  menuTopLeft = { x: 0, y: 0 };

  components: unknown[];

  constructor(
    private route: ActivatedRoute,
    private snackBar: SnackbarService,
    private modalService: ModalService,
    private renderer: Renderer2,
    private controllerService: ControllerService,
    private scriptService: ScriptsService,
    public scriptResources: ScriptResourcesService,
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

    this.scriptResources.loadResources();

    if (this.scriptId === '0') {
      this.scriptId = this.generateScriptId(5);
      console.log(`new script id:${this.scriptId}`);
      this.script = new Script(
        this.scriptId,
        'New Script',
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

          while (!this.scriptResources.loaded) {
            await new Promise((r) => setTimeout(r, 100));
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
        const val = ch.events.get(key);
        if (val !== undefined) {
          ch.eventsKvpArray.push({ key: key, value: val });
        }
      }
    }

    this.scriptService.saveScript(this.script).subscribe(observer);
  }

  //#region testing methods

  openScriptTestModal() {
    this.container.clear();

    const modalResources = new Map<string, unknown>();

    modalResources.set(ScriptTestModalResources.scriptId, this.scriptId);

    const locations = new Array<DeploymentLocation>();

    const locationDetails = this.scriptResources.getLocationDetailsList();

    locationDetails.forEach((detail) => {
      if (detail.assigned) {
        locations.push({
          id: detail.id,
          name: detail.name.toLocaleLowerCase()
        });
      }
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
        const val = ch.events.get(key);
        if (val !== undefined) {
          ch.eventsKvpArray.push({ key: key, value: val });
        }
      }
    }

    this.scriptService.saveScript(this.script).subscribe(observer);
  }

  sendChannelTest(
    controllerId: number,
    commandType: ScriptChannelType,
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

  //#region channel modal

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
      AddChannelModalResources.controllers,
      this.scriptResources.getLocationDetailsList(),
    );

    modalResources.set(
      AddChannelModalResources.channels,
      this.scriptResources.getChannelDetailsMap(true),
    );

    const component = this.container.createComponent(AddChannelModalComponent);

    component.instance.resources = modalResources;
    component.instance.modalCallback.subscribe((evt: ModalCallbackEvent) => {
      this.modalCallback(evt);
    });
    this.components.push(component);

    this.modalService.open('scripter-modal');
  }

  //#endregion

  //#region event modal

  openNewEventModal(event: unknown) {
    const evt = event as MenuItemDetails;
    console.log(evt);

    let time = 0;

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

    const scriptEvent = new ScriptEvent(
      ch.id,
      ch.moduleChannel.moduleType,
      ch.moduleChannel.moduleSubType,
      time,
      undefined,
    );

    this.createEventModal(scriptEvent, false);
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

    switch (event.moduleType) {
      case ModuleType.uart:
        switch (event.moduleSubType) {
          case ModuleSubType.genericSerial: {
            component = this.container.createComponent(UartEventModalComponent);
            break;
          }
          case ModuleSubType.kangaroo: {
            component = this.container.createComponent(
              KangarooEventModalComponent,
            );
            modalResources.set(
              KangarooEventModalResources.kangaroo,
              event.scriptChannel,
            );
            break;
          }
          case ModuleSubType.humanCyborgRelationsSerial: {
            component = this.container.createComponent(
              HumanCyborgModalComponent,
            );
            break;
          }
          case ModuleSubType.maestro: {
            const scriptChannel = this.getScriptChannel(event.scriptChannel);
            if (!scriptChannel) {
              console.log(
                `could not find channel for event: ${JSON.stringify(event)}`,
              );
              this.snackBar.okToast('Error: Could not find channel for event!');
              return;
            }
            const mch = scriptChannel.moduleChannel as MaestroChannel;
            if (mch.isServo) {
              component = this.container.createComponent(
                ServoEventModalComponent,
              );
            } else {
              component = this.container.createComponent(
                GpioEventModalComponent,
              );
            }
          }
        }
        break;
      case ModuleType.i2c: {
        component = this.container.createComponent(I2cEventModalComponent);
        break;
      }
      case ModuleType.gpio: {
        component = this.container.createComponent(GpioEventModalComponent);
        break;
      }
    }

    component.instance.resources = modalResources;
    component.instance.modalCallback.subscribe((evt: ModalCallbackEvent) => {
      this.modalCallback(evt);
    });
    this.components.push(component);

    this.modalService.open('scripter-modal');
  }

  //#endregion

  modalCallback(evt: ModalCallbackEvent) {
    switch (evt.type) {
      case AddChannelModalResources.addChannelEvent: {
        const value = evt.value as AddChannelModalResponse;
        this.addChannel(value.channels);
        break;
      }
      case ConfirmModalResources.confirmEvent:
        this.handleConfirmModalEvent(evt.value as ConfirmModalEvent);
        break;
      case ScriptEventModalResources.addEvent: {
        const value = evt.value as ScriptEventModalResponse;
        this.addEvent(value.scriptEvent);
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

  //#region script row callbacks

  timelineCallback(msg: TimeLineEvent) {
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

      this.scriptResources.setChannelAvailablity(
        channel.moduleChannelId,
        channel.channelType,
        true,
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

      modalResources.set(
        ChannelTestModalResources.scriptChannelType,
        ch.channelType,
      );
      //modalResources.set(ChannelTestModalResources.channelId, ch.channelId);
      //modalResources.set(ChannelTestModalResources.controller, ch.locationId);

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

  //#region channel and event management

  getSelectableChannels(type: ScriptChannelType): ChannelDetails[] {
    const availableChannels = this.scriptResources.getChannelDetailsList(
      type,
      false,
    );
    if (availableChannels) {
      return availableChannels.sort((a, b) => a.name.localeCompare(b.name));
    }

    console.log(`no available channels for ${type}`);
    return [];
  }

  moduleChannelChanged(event: ModuleChannelChangedEvent) {
    const idx = this.scriptChannels.findIndex(
      (ch) => ch.id === event.channelId,
    );
    const swapIdx = this.scriptChannels.findIndex(
      (ch) => ch.moduleChannelId === event.newModuleChannelId,
    );

    const channel = this.scriptChannels[idx];

    const chValue = this.scriptResources.getScriptChannelResource(
      event.newModuleChannelId,
      channel.channelType,
    );

    if (chValue === undefined) {
      console.log(`no channel found for ${event.newModuleChannelId}`);
      return;
    }

    channel.parentModuleId = chValue.parentModuleId;
    channel.moduleChannelId = event.newModuleChannelId;
    channel.moduleChannel = chValue?.channel;
    this.scriptResources.setChannelAvailablity(
      channel.moduleChannelId,
      channel.channelType,
      false,
    );

    // if the new selected channel is already in use, swap it to the old channel
    if (swapIdx !== -1) {
      const swapChannel = this.scriptChannels[swapIdx];
      const oldChValue = this.scriptResources.getScriptChannelResource(
        event.oldModuleChannelId,
        swapChannel.channelType,
      );
      if (oldChValue === undefined) {
        console.log(`no channel found for ${event.oldModuleChannelId}`);
        return;
      }
      swapChannel.parentModuleId = oldChValue?.parentModuleId;
      swapChannel.moduleChannelId = event.oldModuleChannelId;
      swapChannel.moduleChannel = oldChValue?.channel;
      this.scriptResources.setChannelAvailablity(
        swapChannel.moduleChannelId,
        swapChannel.channelType,
        false,
      );
    } else {
      this.scriptResources.setChannelAvailablity(
        event.oldModuleChannelId,
        channel.channelType,
        true,
      );
    }
  }

  private addChannel(map: Map<ScriptChannelType, string[]>): void {
    for (const k of map.keys()) {
      const channels = map.get(k);

      if (!channels) {
        continue;
      }

      channels.forEach((channel) => {
        this.scriptResources.setChannelAvailablity(channel, k, false);

        const chValue = this.scriptResources.getScriptChannelResource(
          channel,
          k,
        );

        if (chValue === undefined) {
          return;
        }

        const ch = new ScriptChannel(
          Guid.create().toString(),
          this.script.id,
          k,
          chValue.parentModuleId,
          chValue.channelId,
          ModuleChannelTypes.fromSubType(chValue.channel.moduleSubType),
          chValue.channel,
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

    if (chIdx === -1) {
      console.log(`could not find channel for event: ${JSON.stringify(event)}`);
      this.snackBar.okToast('Error: Could not find channel for event!');
      return;
    }

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
    /* let val = a.locationId.localeCompare(b.locationId);
 
     if (val !== 0) {
       return val;
     }
 
     val = a.channelType - b.channelType;
 
     if (val !== 0) {
       return val;
     }
 */
    return a.moduleChannel.channelName < b.moduleChannel.channelName ? -1 : 1;
  }

  //#endregion

  //#region Drag scroll

  startDrag(event: MouseEvent) {
    event.preventDefault();
    this.isDragging = true;
    this.renderer.setStyle(this.scripterContainer.nativeElement, 'cursor', 'grabbing');
    this.dragStartX = event.pageX - this.scripterContainer.nativeElement.offsetLeft;
    this.scrollLeft = this.scripterContainer.nativeElement.scrollLeft;
    this.dragStartY = event.pageY - this.scripterContainer.nativeElement.offsetTop;
    this.scrollTop = this.scripterContainer.nativeElement.scrollTop;
  }

  drag(event: MouseEvent) {
    if (!this.isDragging) return;
    event.preventDefault();
    const x = event.pageX - this.scripterContainer.nativeElement.offsetLeft;
    const walkX = (x - this.dragStartX);
    this.scripterContainer.nativeElement.scrollLeft = this.scrollLeft - walkX;

    const y = event.pageY - this.scripterContainer.nativeElement.offsetTop;
    const walkY = (y - this.dragStartY);
    this.scripterContainer.nativeElement.scrollTop = this.scrollTop - walkY;
  }

  endDrag() {
    this.isDragging = false;
    this.renderer.setStyle(this.scripterContainer.nativeElement, 'cursor', 'auto');
  }

  //#endregion

  //#region utility methods

  private getScriptChannel(channelId: string): ScriptChannel | undefined {
    return this.scriptChannels.find((ch) => ch.id === channelId);
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
  //#endregion
}
