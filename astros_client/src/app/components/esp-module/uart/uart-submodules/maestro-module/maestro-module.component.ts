import { AfterViewInit, Component } from '@angular/core';
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
  imports: [
    NgIf,
    NgFor,
    FormsModule,
    MaestroChannelComponent
  ],
})
export class MaestroModuleComponent
  extends BaseUartSubModuleComponent
  {

  subModule!: MaestroModule;

  ngOnInit(): void {
    if (this.module) {
      this.uartChannel = this.module.uartChannel.toString();
      this.baudRate = this.module.baudRate.toString();
      this.subModule = this.module.subModule as MaestroModule;
    }
  }
}
