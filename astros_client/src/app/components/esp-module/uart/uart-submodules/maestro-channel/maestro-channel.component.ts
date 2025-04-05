import { NgIf } from '@angular/common';
import {
  AfterContentInit,
  Component,
  EventEmitter,
  Input,
  Output,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ServoSettingsComponent } from '@src/components/esp-module/shared/servo-settings/servo-settings.component';
import { MaestroChannel, ModuleSubType } from 'astros-common';
import { ServoTestEvent } from '../../../utility/module-events';

@Component({
  selector: 'app-maestro-channel',
  imports: [ServoSettingsComponent, FormsModule, NgIf],
  templateUrl: './maestro-channel.component.html',
  styleUrl: './maestro-channel.component.scss',
})
export class MaestroChannelComponent implements AfterContentInit {
  @Input()
  channel!: MaestroChannel;

  @Input()
  parentTestId!: string;

  @Output()
  servoTestEvent = new EventEmitter<ServoTestEvent>();

  type = '0';

  ngAfterContentInit(): void {
    if (this.channel) {
      if (!this.channel.enabled) {
        this.type = '0';
        return;
      }
      this.type = this.channel.isServo ? '1' : '2';
    }
  }

  onTypeChanged(evt: string): void {
    switch (evt) {
      case '0':
        this.channel.enabled = false;
        break;
      case '1':
        this.channel.enabled = true;
        this.channel.isServo = true;
        break;
      case '2':
        this.channel.enabled = true;
        this.channel.isServo = false;
        break;
    }
  }

  testServoModal(): void {
    this.servoTestEvent.emit({
      controllerAddress: '',
      controllerName: '',
      moduleIdx: -1,
      moduleSubType: ModuleSubType.maestro,
      channelNumber: this.channel.channelNumber,
      value: 0,
    });
  }
}
