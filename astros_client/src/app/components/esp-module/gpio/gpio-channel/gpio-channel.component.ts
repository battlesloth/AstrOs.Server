import { Component, Input } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { GpioChannel } from 'astros-common';

@Component({
  selector: 'app-gpio-channel',
  imports: [
    FormsModule,
    MatCheckboxModule
  ],
  templateUrl: './gpio-channel.component.html',
  styleUrl: './gpio-channel.component.scss'
})
export class GpioChannelComponent {
  @Input()
  channel!: GpioChannel;
}
