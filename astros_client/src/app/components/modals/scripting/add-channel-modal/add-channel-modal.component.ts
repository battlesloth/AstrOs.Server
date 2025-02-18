import { Component, OnInit } from '@angular/core';
import { ScriptChannelType } from 'astros-common';
import { ModalBaseComponent } from '../../modal-base/modal-base.component';
import { ModalCallbackEvent } from '../../modal-base/modal-callback-event';
import { FormsModule } from '@angular/forms';
import { NgFor, NgIf, KeyValuePipe } from '@angular/common';
import { 
  LocationDetails, 
  ChannelDetails 
} from '@src/models/scripting';

export class AddChannelModalResources {
  public static controllers = 'controllers';
  public static modules = 'modules';
  public static channels = 'channels';

  public static addChannelEvent = 'controller_addChannel';
  public static removeChannelEvent = 'controller_removeChannel';
  public static closeEvent = 'controller_close';
}

export interface AddChannelModalResponse {
  controller: string;
  scriptChannelType: ScriptChannelType;
  channels: string[];
}

@Component({
  selector: 'app-add-channel-modal',
  templateUrl: './add-channel-modal.component.html',
  styleUrls: ['./add-channel-modal.component.scss'],
  imports: [FormsModule, NgFor, NgIf, KeyValuePipe],
})
export class AddChannelModalComponent
  extends ModalBaseComponent
  implements OnInit
{
  errorMessage: string;

  controllers!: Map<number, LocationDetails>;
  selectedController = 0;

  private availableModules!: Map<number, Map<ScriptChannelType, string>>;
  modules: Map<ScriptChannelType, string>;
  selectedModule: ScriptChannelType = ScriptChannelType.NONE;

  private availableChannels!: Map<number, Map<ScriptChannelType, ChannelDetails[]>>;
  channels: ChannelDetails[];
  selectedChannel = -1;
  selectedChannels: unknown[] = [];

  constructor() {
    super();

    this.errorMessage = '';

    this.modules = new Map<ScriptChannelType, string>();
    this.channels = new Array<ChannelDetails>();
  }

  ngOnInit(): void {
    this.controllers = this.resources.get(
      AddChannelModalResources.controllers,
    ) as Map<number, LocationDetails>;
    this.availableModules = this.resources.get(
      AddChannelModalResources.modules,
    ) as Map<number, Map<ScriptChannelType, string>>;
    this.availableChannels = this.resources.get(
      AddChannelModalResources.channels,
    ) as Map<number, Map<ScriptChannelType, ChannelDetails[]>>;
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
      +this.selectedModule === ScriptChannelType.NONE
    ) {
      this.errorMessage = 'Module Selection Required';
      return;
    }

    if (
      +this.selectedModule !== ScriptChannelType.NONE &&
      +this.selectedChannels.length < 1
    ) {
      this.errorMessage = 'Channel Selection Required';
      return;
    }

    const evt = new ModalCallbackEvent(
      AddChannelModalResources.addChannelEvent,
      {
        controller: +this.selectedController,
        module:
          +this.selectedController === 4
            ? ScriptChannelType.AUDIO
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
      AddChannelModalResources.closeEvent,
      null,
    );
    this.modalCallback.emit(evt);
  }

  private clearOptions() {
    this.selectedController = 0;
    this.selectedModule = ScriptChannelType.NONE;
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
      this.selectedModule = ScriptChannelType.NONE;
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

  private setChannels(channelType: ScriptChannelType) {
    if (channelType === ScriptChannelType.NONE) {
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
