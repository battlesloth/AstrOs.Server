import { AfterViewInit, Component } from '@angular/core';
import { BaseUartSubModuleComponent } from '../base-uart-sub-module/base-uart-sub-module.component';
import { FormsModule } from '@angular/forms';
import { NgIf } from '@angular/common';

@Component({
  selector: 'app-generic-serial-module',
  templateUrl: './generic-serial-module.component.html',
  styleUrls: [
    '../base-uart-sub-module/base-uart-sub-module.component.scss',
    './generic-serial-module.component.scss'
  ],
  imports: [
    NgIf,
    FormsModule
  ],
})
export class GenericSerialModuleComponent
extends BaseUartSubModuleComponent
implements AfterViewInit {

  ngAfterViewInit(): void {
    if (this.module) {
      this.uartChannel = this.module.uartChannel.toString();
      this.baudRate = this.module.baudRate.toString();
     }
  }
}
