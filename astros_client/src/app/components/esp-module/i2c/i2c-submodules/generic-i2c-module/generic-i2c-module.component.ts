import { Component, OnInit } from '@angular/core';
import { BaseI2cSubModuleComponent } from '../base-i2c-sub-module/base-i2c-sub-module.component';

import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-generic-i2c-module',
  imports: [FormsModule],
  templateUrl: './generic-i2c-module.component.html',
  styleUrls: [
    '../base-i2c-sub-module/base-i2c-sub-module.component.scss',
    './generic-i2c-module.component.scss',
  ],
})
export class GenericI2cModuleComponent
  extends BaseI2cSubModuleComponent
  implements OnInit
{
  ngOnInit(): void {
    if (this.module) {
      this.i2cAddress = this.module.i2cAddress.toString();
    }
  }
}
