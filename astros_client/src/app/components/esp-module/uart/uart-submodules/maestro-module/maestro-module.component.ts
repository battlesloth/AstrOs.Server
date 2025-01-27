import { Component, OnInit } from '@angular/core';
import { MaestroChannel, MaestroModule } from 'astros-common';
import { BaseUartSubModuleComponent } from '../base-uart-sub-module/base-uart-sub-module.component';
import { FormsModule } from '@angular/forms';
import { NgFor, NgIf } from '@angular/common';
import { MaestroChannelComponent } from '../maestro-channel/maestro-channel.component';

@Component({
  selector: 'app-maestro-module',
  templateUrl: './maestro-module.component.html',
  styleUrls: [
    '../base-uart-sub-module/base-uart-sub-module.component.scss',
    './maestro-module.component.scss',
  ],
  imports: [NgIf, NgFor, FormsModule, MaestroChannelComponent],
})
export class MaestroModuleComponent
  extends BaseUartSubModuleComponent
  implements OnInit
{
  subModule!: MaestroModule;

  availableChannels = Array.from({ length: 24 }, (_, i) => i + 1);

  ngOnInit(): void {
    if (this.module) {
      this.uartChannel = this.module.uartChannel.toString();
      this.baudRate = this.module.baudRate.toString();
      this.subModule = this.module.subModule as MaestroModule;
    }
  }

  addChannel(): void {
    this.subModule.boards[0].channels.push(
      new MaestroChannel(
        this.getNextChannelId(),
        'New Channel',
        true,
        this.module.id,
        true,
        500,
        2500,
        500,
        false,
        this.module.uartChannel,
        this.module.baudRate,
      ),
    );
  }

  setAvailableChannels(): void {
    for (const ch of this.subModule.boards[0].channels) {
      this.availableChannels = this.availableChannels.filter(
        (c) => c !== ch.id,
      );
    }
  }

  getNextChannelId(): number {
    const nextId = this.availableChannels[0];
    this.availableChannels = this.availableChannels.slice(1);
    return nextId;
  }
}
