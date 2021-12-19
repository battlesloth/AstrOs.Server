import { EventEmitter, Component, Input, OnInit, Output, AfterViewInit, Renderer2, ViewChild, ElementRef } from '@angular/core';
import { ScriptChannel } from 'src/app/models/script-channel';
import {faTrash, faEdit} from '@fortawesome/free-solid-svg-icons'
@
Component({
  selector: 'app-script-row',
  templateUrl: './script-row.component.html',
  styleUrls: ['./script-row.component.scss']
})

export class ScriptRowComponent implements OnInit, AfterViewInit {

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
    this.timeLineArray = Array.from({length: this.seconds}, (_, i) => i + 1)
  }
  ngAfterViewInit(): void {



    this.channel.events.forEach( evt =>{
      const floater = this.renderer.createElement('div');
      const text = this.renderer.createText(evt.time.toString());
      this.renderer.appendChild(floater, text);
      this.renderer.setAttribute(floater, 'class', 'scripter-timeline-marker');
      this.renderer.setStyle(floater, 'top', `0px`);
      this.renderer.setStyle(floater, 'left', `${(evt.time * this.segmentWidth) - 30}px`);
      this.renderer.appendChild(this.timelineEl.nativeElement, floater);  
    });

    }

  ngOnInit(): void {
  }

  remove(): void{
    this.removeCallback.emit({id: this.channel.id});
  }


  onTimelineRightClick(event: MouseEvent): void {
    event.preventDefault();

    this.timelineCallback.emit({event: event, id: this.channel.id});
  }
}
