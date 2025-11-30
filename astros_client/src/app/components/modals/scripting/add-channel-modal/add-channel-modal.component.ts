import { Component, OnInit } from '@angular/core';
import { ScriptChannelType } from 'astros-common';
import { ModalBaseComponent } from '../../modal-base/modal-base.component';
import { ModalCallbackEvent } from '../../modal-base/modal-callback-event';
import { FormsModule } from '@angular/forms';

import { LocationDetails, ChannelDetails } from '@src/models/scripting';

export class AddChannelModalResources {
  public static controllers = 'controllers';
  public static modules = 'modules';
  public static channels = 'channels';

  public static addChannelEvent = 'addChannelModal_addChannel';
  public static closeEvent = 'controller_close';
}

interface scriptChannelType {
  id: ScriptChannelType;
  name: string;
}

export interface AddChannelModalResponse {
  channels: Map<ScriptChannelType, string[]>;
}

@Component({
  selector: 'app-add-channel-modal',
  templateUrl: './add-channel-modal.component.html',
  styleUrls: ['./add-channel-modal.component.scss'],
  imports: [FormsModule],
})
export class AddChannelModalComponent
  extends ModalBaseComponent
  implements OnInit
{
  errorMessage: string;

  controllers!: LocationDetails[];
  selectedController = '_any_';

  channelTypes: scriptChannelType[] = [
    { id: ScriptChannelType.NONE, name: 'Any Channel Type' },
    { id: ScriptChannelType.AUDIO, name: 'Audio Channels' },
    { id: ScriptChannelType.GPIO, name: 'GPIO Channels' },
    { id: ScriptChannelType.GENERIC_I2C, name: 'I2C Channels' },
    { id: ScriptChannelType.KANGAROO, name: 'KangarooX2 Channels' },
    { id: ScriptChannelType.GENERIC_UART, name: 'Serial Channels' },
    { id: ScriptChannelType.SERVO, name: 'Servo Channels' },
  ];
  selectedChannelType: ScriptChannelType = ScriptChannelType.NONE;

  private availableChannels!: Map<ScriptChannelType, ChannelDetails[]>;
  channels: ChannelDetails[];
  selectedChannel = -1;
  selectedChannels: unknown[] = [];

  constructor() {
    super();

    this.errorMessage = '';
    this.channels = new Array<ChannelDetails>();
  }

  ngOnInit(): void {
    this.controllers = this.resources.get(
      AddChannelModalResources.controllers,
    ) as LocationDetails[];

    this.controllers.unshift({
      id: '_any_',
      name: 'Any Controller',
      assigned: true,
    });

    this.availableChannels = this.resources.get(
      AddChannelModalResources.channels,
    ) as Map<ScriptChannelType, ChannelDetails[]>;

    this.fliterAvailableChannels();
  }

  modalChanged(_: Event) {
    this.fliterAvailableChannels();
  }

  fliterAvailableChannels() {
    this.channels = [];

    const type = +this.selectedChannelType as ScriptChannelType;

    if (type !== ScriptChannelType.NONE) {
      const temp = this.availableChannels.get(type);

      if (temp) {
        this.channels = [...temp];
      }
    } else {
      for (const val of this.availableChannels.values()) {
        this.channels.push(...val);
      }
    }

    if (this.selectedController !== '_any_') {
      this.channels = this.channels.filter(
        (x) => x.locationId === this.selectedController,
      );
    }

    this.channels = this.channels.sort((a, b) => a.name.localeCompare(b.name));
  }

  addChannel() {
    const toAdd = new Map<ScriptChannelType, string[]>();

    for (const channel of this.selectedChannels) {
      const channelDetails = this.channels.find((x) => x.id === channel);

      if (channelDetails) {
        if (!toAdd.has(channelDetails.scriptChannelType)) {
          toAdd.set(channelDetails.scriptChannelType, []);
        }

        toAdd.get(channelDetails.scriptChannelType)?.push(channelDetails.id);
      }
    }

    const evt = new ModalCallbackEvent(
      AddChannelModalResources.addChannelEvent,
      {
        channels: toAdd,
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
    this.selectedController = '_any_';
    this.selectedChannelType = ScriptChannelType.NONE;
    this.selectedChannel = -1;
  }
}
