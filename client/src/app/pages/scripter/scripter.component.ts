import { AfterViewInit, Component, ElementRef, OnInit, Renderer2, ViewChild } from '@angular/core';
import { DOCUMENT } from '@angular/common'
import { MatMenuTrigger } from '@angular/material/menu'

export class ScriptItem {
  id: string;
  component: string;
  start: Date;
  end: Date;

  constructor(id: string, component: string, start: Date, end: Date) {
    this.id = id;
    this.component = component;
    this.start = start;
    this.end = end;
  }
};

export class ScriptModule {
  id: string;
  name: string;

  constructor(id: string, name: string) {
    this.id = id;
    this.name = name;
  }
};

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

  private seconds : number = 600;

  private modules: Map<string, ScriptModule>;

  private items: Array<ScriptItem>;

  timeLineArray: Array<number>;

  menuTopLeft = { x: 0, y: 0 };

  constructor(private renderer: Renderer2) {
    this.timeLineArray = Array.from({length: this.seconds}, (_, i) => i + 1)

    this.items = new Array<ScriptItem>(
      new ScriptItem('t1', '1', new Date('2021/6/1'), new Date('2021/6/4')),
      new ScriptItem('t2', '2', new Date('2021/6/3'), new Date('2021/6/4')),
      new ScriptItem('t3', '3', new Date('2021/6/2'), new Date('2021/6/3')),
    );

    this.modules = new Map<string, ScriptModule>();

  }


  onTimelineRightClick(event: MouseEvent, timeline: string) {
    event.preventDefault();

    this.menuTopLeft.x = event.clientX;
    this.menuTopLeft.y = event.clientY;

    this.menuTrigger.menuData = { 'item': { 'timeline': timeline, 'xPos': event.clientX } };

    this.menuTrigger.openMenu();
  }

  onAddModuleClick(event: MouseEvent) {

  }

  onAddEvent(item: Item): void {}
  
  ngOnInit(): void {
  }

}
