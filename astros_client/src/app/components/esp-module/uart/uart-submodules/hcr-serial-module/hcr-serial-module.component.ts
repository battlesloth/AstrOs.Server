import { Component, OnInit } from '@angular/core';
import { BaseUartSubModuleComponent } from '../base-uart-sub-module/base-uart-sub-module.component';
import { FormsModule } from '@angular/forms';


@Component({
  selector: 'app-hcr-serial-module',
  templateUrl: './hcr-serial-module.component.html',
  styleUrls: [
    '../base-uart-sub-module/base-uart-sub-module.component.scss',
    './hcr-serial-module.component.scss',
  ],
  imports: [FormsModule],
})
export class HcrSerialModuleComponent
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
