import { Component, OnInit } from '@angular/core';
import { BaseI2cSubModuleComponent } from '../base-i2c-sub-module/base-i2c-sub-module.component';
import { NgFor, NgIf } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-pca9685-module',
  imports: [FormsModule, NgIf, NgFor],
  templateUrl: './pca9685-module.component.html',
  styleUrls: [
    '../base-i2c-sub-module/base-i2c-sub-module.component.scss',
    './pca9685-module.component.scss',
  ],
})
export class Pca9685ModuleComponent
  extends BaseI2cSubModuleComponent
  implements OnInit
{
  ngOnInit(): void {
    if (this.module) {
      this.i2cAddress = this.module.i2cAddress.toString();
    }
  }
}
