import { Component, OnInit } from '@angular/core';
import { BaseUartSubModuleComponent } from '../base-uart-sub-module/base-uart-sub-module.component';
import { FormsModule } from '@angular/forms';


@Component({
  selector: 'app-generic-serial-module',
  templateUrl: './generic-serial-module.component.html',
  styleUrls: [
    '../base-uart-sub-module/base-uart-sub-module.component.scss',
    './generic-serial-module.component.scss',
  ],
  imports: [FormsModule],
})
export class GenericSerialModuleComponent
  extends BaseUartSubModuleComponent
  implements OnInit
{
  ngOnInit(): void {
    if (this.module) {
      this.uartChannel = this.module.uartChannel.toString();
      this.baudRate = this.module.baudRate.toString();
    }
  }
}
