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
export class ScripterComponent implements AfterViewInit {

  @ViewChild(MatMenuTrigger) menuTrigger!: MatMenuTrigger;

  @ViewChild('scripterModules', { static: false }) moduleEl!: ElementRef;
  @ViewChild('scripterTimeline', { static: false }) timelineEl!: ElementRef;

  private modules: Map<string, ScriptModule>;

  private items: Array<ScriptItem>;

  menuTopLeft = { x: 0, y: 0 };

  constructor(private renderer: Renderer2) {
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
    const module = `test-${this.modules.size}`;
    
    this.modules.set(module, new ScriptModule(module, module));

    this.addModule(module);
    this.appendAddModuleLine();
  }

  onAddEvent(item: Item): void {

    const line = document.getElementById(item.timeline);

    if (line != null) {
      let left = Math.floor((item.xPos - line.offsetLeft) / 41) * 41;

      if (Math.floor(item.xPos - line.offsetLeft) - left > 20) {
        left += 20;
      } else {
        left -= 20;
      }

      const floater = this.renderer.createElement('div');
      this.renderer.setAttribute(floater, 'class', 'scripter-timeline-marker');
      this.renderer.setStyle(floater, 'top', `0px`);
      this.renderer.setStyle(floater, 'left', `${left}px`);
      this.renderer.setStyle(floater, 'width', '40px');
      this.renderer.appendChild(line, floater);
    }
  }



  ngAfterViewInit(): void {

    const div = this.renderer.createElement('div');
    this.renderer.setAttribute(div, 'class', 'scripter-module-header-row');
    this.renderer.appendChild(this.moduleEl.nativeElement, div);

    const timelineheader = this.renderer.createElement('div');
    this.renderer.setAttribute(timelineheader, 'class', 'scripter-timeline-header-row');


    const spacerDiv = this.renderer.createElement('div');
    this.renderer.setAttribute(spacerDiv, 'class', 'scripter-timeline-header-period-spacer');
    const text = this.renderer.createText('.');
    this.renderer.appendChild(spacerDiv, text);
    this.renderer.appendChild(timelineheader, spacerDiv);

    for (let i = 1; i < 30; i++) {
      const timeDiv = this.renderer.createElement('div');
      this.renderer.setAttribute(timeDiv, 'class', 'scripter-timeline-header-period');
      const text = this.renderer.createText(i.toString());
      this.renderer.appendChild(timeDiv, text);
      this.renderer.appendChild(timelineheader, timeDiv);
    }

    this.renderer.appendChild(this.timelineEl.nativeElement, timelineheader);


    this.appendAddModuleLine();

  }

  private addModule(name: string) {
    const addModule = document.getElementById(`${name}-module`);

    if (addModule == null) {
      const addModuleDiv = this.renderer.createElement('div');
      this.renderer.setAttribute(addModuleDiv, 'class', 'scripter-module');
      const addModuleText = this.renderer.createText(name);
      this.renderer.appendChild(addModuleDiv, addModuleText);
      this.renderer.setAttribute(addModuleDiv, 'id', `${name}-module`);
      this.renderer.appendChild(this.moduleEl.nativeElement, addModuleDiv);
    } else {
      console.log(`${name}-module already exists!`);
      return;
    }

    const timelineDiv = this.renderer.createElement('div');
    this.renderer.setAttribute(timelineDiv, 'class', 'scripter-timeline-row');

    for (let i = 0; i < 30; i++) {
      const timeDiv = this.renderer.createElement('div');
      this.renderer.setAttribute(timeDiv, 'class', 'scripter-timeline-period');
      this.renderer.appendChild(timelineDiv, timeDiv);
    }

    this.renderer.setAttribute(timelineDiv, 'id', `${name}-module-timeline`);
    this.renderer.listen(timelineDiv, 'contextmenu', (evt) => this.onTimelineRightClick(evt, `${name}-module-timeline`));


    this.renderer.appendChild(this.timelineEl.nativeElement, timelineDiv);
  }


  private appendAddModuleLine() {

    const addModule = document.getElementById('add-module');

    if (addModule != null) {
      addModule.remove();
    }

    const addModuleDiv = this.renderer.createElement('div');
    this.renderer.setAttribute(addModuleDiv, 'class', 'scripter-module');
    const addModuleText = this.renderer.createText('Add Module');

    this.renderer.appendChild(addModuleDiv, addModuleText);

    this.renderer.setAttribute(addModuleDiv, 'id', 'add-module');

    this.renderer.listen(addModuleDiv, 'click', (evt) => this.onAddModuleClick(evt));

    this.renderer.appendChild(this.moduleEl.nativeElement, addModuleDiv);


    const addModuleTimeline = document.getElementById('add-module-timeline');

    if (addModuleTimeline != null) {
      addModuleTimeline.remove();
    }
    const timelineDiv = this.renderer.createElement('div');
    this.renderer.setAttribute(timelineDiv, 'class', 'scripter-timeline-row');

    for (let i = 0; i < 30; i++) {
      const timeDiv = this.renderer.createElement('div');
      this.renderer.setAttribute(timeDiv, 'class', 'scripter-timeline-period');
      this.renderer.appendChild(timelineDiv, timeDiv);
    }

    this.renderer.setAttribute(timelineDiv, 'id', 'add-module-timeline');

    this.renderer.appendChild(this.timelineEl.nativeElement, timelineDiv);
  }


  ngOnInit(): void {
  }

}
