import { AfterViewInit, Component } from '@angular/core';
import { KangarooX2 } from 'astros-common';
import { FormsModule } from '@angular/forms';
import { BaseUartSubModuleComponent } from '../base-uart-sub-module/base-uart-sub-module.component';
import { NgIf } from '@angular/common';

@Component({
  selector: 'app-kangaroo-module',
  templateUrl: './kangaroo-module.component.html',
  styleUrls: [
    '../base-uart-sub-module/base-uart-sub-module.component.scss',
    './kangaroo-module.component.scss'
  ],
  imports: [
    NgIf,
    FormsModule
  ],
})
export class KangarooModuleComponent
  extends BaseUartSubModuleComponent
  {

  subModule!: KangarooX2;

  ngOnInit(): void {
    if (this.module) {
      this.uartChannel = this.module.uartChannel.toString();
      this.baudRate = this.module.baudRate.toString();
      this.subModule = this.module.subModule as KangarooX2;
    }
  }
}
