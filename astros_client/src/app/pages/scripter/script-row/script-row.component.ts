import { EventEmitter, Component, Input, OnInit, Output, Renderer2, ViewChild, ElementRef } from '@angular/core';
import { faTrash, faEdit, faPlay } from '@fortawesome/free-solid-svg-icons'
import { UartType, ScriptChannel } from 'astros-common';
@
  Component({
    selector: 'app-script-row',
    templateUrl: './script-row.component.html',
    styleUrls: ['./script-row.component.scss']
  })

export class ScriptRowComponent implements OnInit {

  private segmentWidth: number = 60;
  faTrash = faTrash;
  faEdit = faEdit;
  faPlay = faPlay;

  @ViewChild('timeline', { static: false }) timelineEl!: ElementRef;

  @Input()
  channel!: ScriptChannel

  @Output("timelineCallback") timelineCallback: EventEmitter<any> = new EventEmitter();
  @Output("removeCallback") removeCallback: EventEmitter<any> = new EventEmitter();
  @Output("channelTestCallback") channelTestCallback: EventEmitter<any> = new EventEmitter();

  timeLineArray: Array<number>;
  private segments: number = 3000;
  private segmentFactor: number = 10;

  constructor(private renderer: Renderer2) {
    this.timeLineArray = Array.from({ length: this.segments }, (_, i) => (i + 1))
  }

 
  ngOnInit(): void {
  }

  remove(): void {
    this.removeCallback.emit({ id: this.channel.id });
  }

  test(): void {
    this.channelTestCallback.emit({id: this.channel.id})
  }

  onTimelineRightClick(event: MouseEvent): void {
    event.preventDefault();

    this.timelineCallback.emit({ event: event, id: this.channel.id });
  }

  serialName(type: UartType): string {
    switch (type){
      case UartType.none:
        return "None";
      case UartType.genericSerial:
        return "Generic Serial";
      case UartType.kangaroo:
        return "Kangaroo X2";
      case UartType.humanCyborgRelations:
        return "Human Cyborg Relations";
      default:
        return "None";
    }
  }
}
