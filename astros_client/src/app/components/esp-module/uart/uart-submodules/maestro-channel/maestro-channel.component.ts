import { Component, Input } from '@angular/core';
import { MaestroChannel } from 'astros-common';

@Component({
  selector: 'app-maestro-channel',
  imports: [],
  templateUrl: './maestro-channel.component.html',
  styleUrl: './maestro-channel.component.scss',
})
export class MaestroChannelComponent {
  @Input() channel!: MaestroChannel;
}
