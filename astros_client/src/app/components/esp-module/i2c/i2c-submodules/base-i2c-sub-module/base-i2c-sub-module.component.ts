import {
  Component,
  EventEmitter,
  Input,
  OnChanges,
  Output,
} from '@angular/core';
import { I2cModule } from 'astros-common';

@Component({
  selector: 'app-base-i2c-module',
  template: '',
  styleUrl: './base-i2c-sub-module.component.scss',
})
export abstract class BaseI2cSubModuleComponent implements OnChanges {
  @Input()
  module!: I2cModule;

  @Output()
  i2cAddressChangedEvent = new EventEmitter<string>();

  @Input()
  parentTestId!: string;

  i2cAddress!: string;
  addresses = Array.from(Array(128).keys()).map((val) => val.toString());

  ngOnChanges(): void {
    if (this.module) {
      this.i2cAddress = this.module.i2cAddress.toString();
    }
  }

  onI2cAddressChange(val: string) {
    this.i2cAddressChangedEvent.emit(val);
  }
}
