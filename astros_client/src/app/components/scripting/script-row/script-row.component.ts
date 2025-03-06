import {
  EventEmitter,
  Component,
  Input,
  Output,
  ViewChild,
  ElementRef,
  OnChanges,
} from '@angular/core';
import { faTrash, faEdit, faPlay } from '@fortawesome/free-solid-svg-icons';
import { ScriptChannel, ModuleSubType, MaestroChannel } from 'astros-common';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { NgFor, NgIf } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ChannelDetails } from '@src/models/scripting';

export interface ModuleChannelChangedEvent {
  channelId: string;
  oldModuleChannelId: string;
  newModuleChannelId: string;
}

export interface TimeLineEvent {
  event: MouseEvent;
  id: string;
}

@Component({
  selector: 'app-script-row',
  templateUrl: './script-row.component.html',
  styleUrls: ['./script-row.component.scss'],
  imports: [NgIf, NgFor, FormsModule, FontAwesomeModule],
})
export class ScriptRowComponent implements OnChanges {
  @Output()
  timelineCallback = new EventEmitter<TimeLineEvent>();

  @Output()
  removeCallback = new EventEmitter<string>();

  @Output()
  channelTestCallback = new EventEmitter<string>();

  @Output()
  moduleChannelChanged = new EventEmitter<ModuleChannelChangedEvent>();

  @Input()
  availableChannels: ChannelDetails[] = [];

  @Input()
  channel!: ScriptChannel;

  moduleChannelId = '';

  private segmentWidth = 60;
  faTrash = faTrash;
  faEdit = faEdit;
  faPlay = faPlay;

  @ViewChild('timeline', { static: false }) timelineEl!: ElementRef;

  channelType:
    | 'HCR'
    | 'Serial'
    | 'GPIO'
    | 'I2C'
    | 'Maestro GPIO'
    | 'Maestro Servo'
    | 'KangarooX2'
    | 'None' = 'None';

  timeLineArray: number[];
  private segments = 3000;

  constructor() {
    this.timeLineArray = Array.from({ length: this.segments }, (_, i) => i + 1);
  }

  ngOnChanges(): void {
    if (this.channel) {
      this.moduleChannelId = this.channel.moduleChannelId;
      this.setChannelType();
    }
  }

  onModuleChannelChange(val: string) {
    this.moduleChannelChanged.emit({
      channelId: this.channel.id,
      oldModuleChannelId: this.channel.moduleChannel.id,
      newModuleChannelId: val,
    });
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

  private setChannelType(): void {
    switch (this.channel.moduleChannel.moduleSubType) {
      case ModuleSubType.genericSerial:
        this.channelType = 'Serial';
        break;
      case ModuleSubType.genericI2C:
        this.channelType = 'I2C';
        break;
      case ModuleSubType.maestro: {
        const ch = this.channel.moduleChannel as MaestroChannel;
        if (ch.isServo) {
          this.channelType = 'Maestro Servo';
        } else {
          this.channelType = 'Maestro GPIO';
        }
        break;
      }
      case ModuleSubType.genericGpio:
        this.channelType = 'GPIO';
        break;
      case ModuleSubType.kangaroo:
        this.channelType = 'KangarooX2';
        break;
      case ModuleSubType.humanCyborgRelationsSerial:
        this.channelType = 'HCR';
        break;
      default:
        this.channelType = 'None';
    }
  }
}
