import { Component, OnInit } from '@angular/core';
import { ChannelType } from 'astros-common';
import { ChannelValue, LocationDetails } from 'src/app/models/script-resources';
import { ModalBaseComponent } from '../../modal-base/modal-base.component';
import { ModalCallbackEvent } from '../../modal-base/modal-callback-event';
import { FormsModule } from '@angular/forms';
import { NgFor, NgIf, KeyValuePipe } from '@angular/common';

export class ControllerModalResources {
  public static controllers = 'controllers';
  public static modules = 'modules';
  public static channels = 'channels';

  public static addChannelEvent = 'controller_addChannel';
  public static removeChannelEvent = 'controller_removeChannel';
  public static closeEvent = 'controller_close';
}

export interface ControllerModalResponse {
  controller: number;
  module: ChannelType;
  channels: number[];
}

@Component({
    selector: 'app-controller-modal',
    templateUrl: './controller-modal.component.html',
    styleUrls: ['./controller-modal.component.scss'],
    imports: [FormsModule, NgFor, NgIf, KeyValuePipe]
})
export class ControllerModalComponent
  extends ModalBaseComponent
  implements OnInit
{
  errorMessage: string;

  controllers!: Map<number, LocationDetails>;
  selectedController = 0;

  private availableModules!: Map<number, Map<ChannelType, string>>;
  modules: Map<ChannelType, string>;
  selectedModule: ChannelType = ChannelType.none;

  private availableChannels!: Map<number, Map<ChannelType, ChannelValue[]>>;
  channels: ChannelValue[];
  selectedChannel = -1;
  selectedChannels: unknown[] = [];

  constructor() {
    super();

    this.errorMessage = '';

    this.modules = new Map<ChannelType, string>();
    this.channels = new Array<ChannelValue>();
  }

  ngOnInit(): void {
    this.controllers = this.resources.get(
      ControllerModalResources.controllers,
    ) as Map<number, LocationDetails>;
    this.availableModules = this.resources.get(
      ControllerModalResources.modules,
    ) as Map<number, Map<ChannelType, string>>;
    this.availableChannels = this.resources.get(
      ControllerModalResources.channels,
    ) as Map<number, Map<ChannelType, ChannelValue[]>>;
  }

  modalChange($event: Event) {
    // convert from string value to number for enum
    if (($event.target as HTMLInputElement).id === 'controller-select') {
      this.setModules(+($event.target as HTMLInputElement).value);
    } else if (($event.target as HTMLInputElement).id === 'module-select') {
      this.setChannels(+($event.target as HTMLInputElement).value);
    }
  }

  addChannel() {
    if (
      +this.selectedController !== 4 &&
      +this.selectedModule === ChannelType.none
    ) {
      this.errorMessage = 'Module Selection Required';
      return;
    }

    if (
      +this.selectedModule !== ChannelType.none &&
      +this.selectedChannels.length < 1
    ) {
      this.errorMessage = 'Channel Selection Required';
      return;
    }

    const evt = new ModalCallbackEvent(
      ControllerModalResources.addChannelEvent,
      {
        controller: +this.selectedController,
        module:
          +this.selectedController === 4
            ? ChannelType.audio
            : +this.selectedModule,
        channels: this.selectedChannels,
      },
    );

    this.modalCallback.emit(evt);
    this.clearOptions();
  }

  closeModal() {
    this.clearOptions();
    const evt = new ModalCallbackEvent(
      ControllerModalResources.closeEvent,
      null,
    );
    this.modalCallback.emit(evt);
  }

  private clearOptions() {
    this.selectedController = 0;
    this.selectedModule = ChannelType.none;
    this.selectedChannel = -1;
    document
      .getElementById('module-select')
      ?.setAttribute('disabled', 'disabled');
    document
      .getElementById('channel-select')
      ?.setAttribute('disabled', 'disabled');
  }

  private setModules(controllerId: number) {
    if (controllerId === 4) {
      this.selectedModule = ChannelType.none;
      this.selectedChannel = -1;
      document
        .getElementById('module-select')
        ?.setAttribute('disabled', 'disabled');
      document
        .getElementById('channel-select')
        ?.setAttribute('disabled', 'disabled');
    } else {
      const mods = this.availableModules.get(+this.selectedController);
      if (mods) {
        this.modules = mods;
        document.getElementById('module-select')?.removeAttribute('disabled');
        //this.selectedModule = ChannelType.none;
        this.setChannels(this.selectedModule);
      }
    }
  }

  private setChannels(channelType: ChannelType) {
    if (channelType === ChannelType.none) {
      this.selectedChannel = -1;
      document
        .getElementById('channel-select')
        ?.setAttribute('disabled', 'disabled');
    } else {
      const chs = this.availableChannels
        .get(+this.selectedController)
        ?.get(+channelType);
      if (chs) {
        this.channels = chs;
        document.getElementById('channel-select')?.removeAttribute('disabled');
      }
    }
  }
}
