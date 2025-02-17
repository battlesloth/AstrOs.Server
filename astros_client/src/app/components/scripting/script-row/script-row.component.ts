import {
  EventEmitter,
  Component,
  Input,
  Output,
  //Renderer2,
  ViewChild,
  ElementRef,
} from '@angular/core';
import { faTrash, faEdit, faPlay } from '@fortawesome/free-solid-svg-icons';
import {
  ScriptChannel,
  AstrOsConstants,
  ModuleType,
  ModuleSubType
} from 'astros-common';
import { NgIf } from '@angular/common';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { UartChannel } from 'astros-common/dist/control_module/uart/uart_channel';

@Component({
  selector: 'app-script-row',
  templateUrl: './script-row.component.html',
  styleUrls: ['./script-row.component.scss'],
  imports: [NgIf, FontAwesomeModule],
})
export class ScriptRowComponent {
  private segmentWidth = 60;
  faTrash = faTrash;
  faEdit = faEdit;
  faPlay = faPlay;

  locationName = 'Location';
  uartType = 'None';

  @ViewChild('timeline', { static: false }) timelineEl!: ElementRef;

  _channel!: ScriptChannel;

  @Input()
  set channel(channel: ScriptChannel) {
    this._channel = channel;
    this.locationName = this.getLocationName(channel.locationId);
    if (channel.moduleChannel.moduleType === ModuleType.uart) {
      const ch = channel.moduleChannel as UartChannel;
      this.uartType = this.serialName(ch.moduleSubType);
    }
  }
  get channel(): ScriptChannel {
    return this._channel;
  }

  @Output() timelineCallback = new EventEmitter<unknown>();
  @Output() removeCallback = new EventEmitter<string>();
  @Output() channelTestCallback = new EventEmitter<string>();

  timeLineArray: number[];
  private segments = 3000;

  constructor(){//private renderer: Renderer2) {
    this.timeLineArray = Array.from({ length: this.segments }, (_, i) => i + 1);
  }

  remove(): void {
    this.removeCallback.emit(this.channel.id);
  }

  test(): void {
    this.channelTestCallback.emit(this.channel.id);
  }

  onTimelineRightClick(event: MouseEvent): void {
    event.preventDefault();

    this.timelineCallback.emit({ event: event, id: this.channel.id });
  }

  getLocationName(id: string): string {
    switch (id) {
      case AstrOsConstants.BODY:
        return 'Body';
      case AstrOsConstants.CORE:
        return 'Core';
      case AstrOsConstants.DOME:
        return 'Dome';
      case 'AUDIO':
        return 'Audio Playback';
      default:
        return 'Unknown';
    }
  }

  serialName(type: ModuleSubType): string {
    switch (type) {
      case ModuleSubType.none:
        return 'None';
      case ModuleSubType.genericSerial:
        return 'Generic Serial';
      case ModuleSubType.kangaroo:
        return 'Kangaroo X2';
      case ModuleSubType.humanCyborgRelationsSerial:
        return 'Human Cyborg Relations';
      default:
        return 'None';
    }
  }
}
