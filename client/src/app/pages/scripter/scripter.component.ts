import { AfterViewInit, Component, ElementRef, OnInit, Renderer2, ViewChild } from '@angular/core';

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

@Component({
  selector: 'app-scripter',
  templateUrl: './scripter.component.html',
  styleUrls: ['./scripter.component.scss']
})
export class ScripterComponent implements AfterViewInit {

  @ViewChild(MatMenuTrigger) menuTrigger!: MatMenuTrigger;

  @ViewChild('scripterModules', { static: false }) moduleEl!: ElementRef;
  @ViewChild('scripterTimeline', { static: false }) timelineEl!: ElementRef;



  private items: Array<ScriptItem>;
  private components: Array<ScriptModule>;

  menuTopLeft = {x: 0, y: 0 };

  constructor(private renderer: Renderer2) {
    this.items = new Array<ScriptItem>(
      new ScriptItem('t1', '1', new Date('2021/6/1'), new Date('2021/6/4')),
      new ScriptItem('t2', '2', new Date('2021/6/3'), new Date('2021/6/4')),
      new ScriptItem('t3', '3', new Date('2021/6/2'), new Date('2021/6/3')),
    );


    this.components = new Array<ScriptModule>(
      new ScriptModule('1', 'Component 1'),
      new ScriptModule('2', 'Component 2'),
      new ScriptModule('3', 'Component 3'),
      new ScriptModule('4', 'Component 4'),
      new ScriptModule('1', 'Component 1'),
      new ScriptModule('2', 'Component 2'),
      new ScriptModule('3', 'Component 3'),
      new ScriptModule('4', 'Component 4'),
      new ScriptModule('1', 'Component 1'),
      new ScriptModule('2', 'Component 2'),
      new ScriptModule('3', 'Component 3'),
      new ScriptModule('4', 'Component 4')
    );

  }


  onClick(event: MouseEvent){
    event.preventDefault();

    this.menuTopLeft.x = event.clientX;
    this.menuTopLeft.y = event.clientY;

    this.menuTrigger.menuData = {test: 'Test!'}

    this.menuTrigger.openMenu();
  }

  ngAfterViewInit(): void {

    const div = this.renderer.createElement('div');
    this.renderer.setAttribute(div, 'class', 'scripter-module-header-row');
    this.renderer.appendChild(this.moduleEl.nativeElement, div);

    const timelineheader = this.renderer.createElement('div');
    this.renderer.setAttribute(timelineheader, 'class', 'scripter-timeline-header-row');

    for (let i = 0; i < 30; i++) {
      const timeDiv = this.renderer.createElement('div');
      this.renderer.setAttribute(timeDiv, 'class', 'scripter-timeline-header-period');
      const text = this.renderer.createText(i.toString());
      this.renderer.appendChild(timeDiv, text);
      this.renderer.appendChild(timelineheader, timeDiv);
    }

    this.renderer.appendChild(this.timelineEl.nativeElement, timelineheader);

    this.components.forEach(element => {
      const moduleDiv = this.renderer.createElement('div');
      this.renderer.setAttribute(moduleDiv, 'class', 'scripter-module-row');
      const text = this.renderer.createText(element.name);
      this.renderer.appendChild(moduleDiv, text);
      this.renderer.appendChild(this.moduleEl.nativeElement, moduleDiv);

      const timelineDiv = this.renderer.createElement('div');
      this.renderer.setAttribute(timelineDiv, 'class', 'scripter-timeline-row');
      
    
      for (let i = 0; i < 30; i++) {
        const timeDiv = this.renderer.createElement('div');
        this.renderer.setAttribute(timeDiv, 'class', 'scripter-timeline-period');
        this.renderer.appendChild(timelineDiv, timeDiv);
        this.renderer.listen(timeDiv, 'contextmenu', (evt) => {this.onClick(evt)})
      }


      this.renderer.appendChild(this.timelineEl.nativeElement, timelineDiv);
    });

  }

  ngOnInit(): void {
  }

}
