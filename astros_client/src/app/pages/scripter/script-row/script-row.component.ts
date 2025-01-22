import {
  EventEmitter,
  Component,
  Input,
  Output,
  Renderer2,
  ViewChild,
  ElementRef,
} from '@angular/core';
import { faTrash, faEdit, faPlay } from '@fortawesome/free-solid-svg-icons';
import { UartType, ScriptChannel } from 'astros-common';
import { NgIf } from '@angular/common';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';

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
    this.uartType = this.serialName(channel.channel.type);
  }
  get channel(): ScriptChannel {
    return this._channel;
  }

  @Output() timelineCallback = new EventEmitter<unknown>();
  @Output() removeCallback = new EventEmitter<string>();
  @Output() channelTestCallback = new EventEmitter<string>();

  timeLineArray: number[];
  private segments = 3000;

  constructor(private renderer: Renderer2) {
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

  getLocationName(id: number): string {
    switch (id) {
      case 1:
        return 'Body';
      case 2:
        return 'Core';
      case 3:
        return 'Dome';
      case 4:
        return 'Audio Playback';
      default:
        return 'Unknown';
    }
  }

  serialName(type: UartType): string {
    switch (type) {
      case UartType.none:
        return 'None';
      case UartType.genericSerial:
        return 'Generic Serial';
      case UartType.kangaroo:
        return 'Kangaroo X2';
      case UartType.humanCyborgRelations:
        return 'Human Cyborg Relations';
      default:
        return 'None';
    }
  }
}
