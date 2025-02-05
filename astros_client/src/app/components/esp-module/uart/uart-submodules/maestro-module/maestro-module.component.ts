import { Component, OnInit } from '@angular/core';
import { MaestroModule } from 'astros-common';
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

  channelCount = "24";
  listSize = 24;

  availableChannels = Array.from({ length: 24 }, (_, i) => i + 1);

  ngOnInit(): void {
    if (this.module) {
      this.uartChannel = this.module.uartChannel.toString();
      this.baudRate = this.module.baudRate.toString();
      this.subModule = this.module.subModule as MaestroModule;
      this.channelCount = this.subModule.boards[0].channelCount.toString();
    }
  }
  
  onChannelCountChange(val: string): void {
    this.listSize = parseInt(val);
    for (let i = 23; i > this.listSize; i--) {
      this.subModule.boards[0].channels[i].enabled = false;
    } 
  }
}
