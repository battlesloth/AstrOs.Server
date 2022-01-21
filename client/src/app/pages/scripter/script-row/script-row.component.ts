import { NONE_TYPE } from '@angular/compiler';
import { EventEmitter, Component, Input, OnInit, Output, AfterViewInit, Renderer2, ViewChild, ElementRef } from '@angular/core';
import { faTrash, faEdit } from '@fortawesome/free-solid-svg-icons'
import { UartType } from 'src/app/models/control_module/uart_module';
import { ScriptChannel } from 'src/app/models/scripts/script_channel';
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

  @ViewChild('timeline', { static: false }) timelineEl!: ElementRef;

  @Input()
  channel!: ScriptChannel

  @Output("timelineCallback") timelineCallback: EventEmitter<any> = new EventEmitter();
  @Output("removeCallback") removeCallback: EventEmitter<any> = new EventEmitter();

  timeLineArray: Array<number>;
  private seconds: number = 300;

  constructor(private renderer: Renderer2) {
    this.timeLineArray = Array.from({ length: this.seconds }, (_, i) => i + 1)
  }

 
  ngOnInit(): void {
  }

  remove(): void {
    this.removeCallback.emit({ id: this.channel.id });
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
      default:
        return "None";
    }
  }
}
