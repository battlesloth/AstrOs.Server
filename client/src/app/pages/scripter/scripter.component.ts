import { AfterViewInit, Component, ElementRef, OnInit, Renderer2, ViewChild } from '@angular/core';
import { DOCUMENT } from '@angular/common'
import { MatMenuTrigger } from '@angular/material/menu'
import { ScriptChannel, ScriptChannelType } from 'src/app/models/script-channel';


export interface Item {
  timeline: string;
  xPos: number;
}

@Component({
  selector: 'app-scripter',
  templateUrl: './scripter.component.html',
  styleUrls: ['./scripter.component.scss']
})
export class ScripterComponent implements OnInit {

  @ViewChild(MatMenuTrigger) menuTrigger!: MatMenuTrigger;

  private seconds: number = 300;

  scriptChannels: Array<ScriptChannel>;

  timeLineArray: Array<number>;

  menuTopLeft = { x: 0, y: 0 };

  constructor(private renderer: Renderer2) {
    this.timeLineArray = Array.from({ length: this.seconds }, (_, i) => i + 1)

    this.scriptChannels = new Array<ScriptChannel>(
      new ScriptChannel(1, ScriptChannelType.Add, 300)
    );

  }


  onTimelineRightClick(event: MouseEvent, timeline: number) {
    event.preventDefault();

    this.menuTopLeft.x = event.clientX;
    this.menuTopLeft.y = event.clientY;

    this.menuTrigger.menuData = { 'item': { 'timeline': timeline, 'xPos': event.clientX } };

    this.menuTrigger.openMenu();
  }

  onAddModuleClick(event: MouseEvent) {

  }

  onAddEvent(item: Item): void { }

  ngOnInit(): void {
  }

}
