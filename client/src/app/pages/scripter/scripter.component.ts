import { Component, OnInit, Renderer2, ViewChild } from '@angular/core';
import { MatMenuTrigger } from '@angular/material/menu'
import { ScriptChannel, ScriptChannelType } from 'src/app/models/script-channel';
import { ModalService } from '../../modal';

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

  constructor(private modalService: ModalService, private renderer: Renderer2) {
    this.timeLineArray = Array.from({ length: this.seconds }, (_, i) => i + 1)

    this.scriptChannels = new Array<ScriptChannel>(
      new ScriptChannel(1, ScriptChannelType.Pwm, this.seconds)
    );
  }

  ngOnInit(): void {
  }

  openModal(id: string){
    this.modalService.open(id);
  }

  closeModal(id: string){
    this.modalService.close(id);
  }

  timelineCallback(msg: any) {
    
    msg.event.preventDefault();

    this.menuTopLeft.x = msg.event.clientX;
    this.menuTopLeft.y = msg.event.clientY;

    this.menuTrigger.menuData = { 'item': { 'timeline': msg.id.timeline, 'xPos': msg.event.clientX } };

    this.menuTrigger.openMenu();
  }

  addChannel(): void {
    this.scriptChannels.push(
      new ScriptChannel(2, ScriptChannelType.Uart, 300)
    );
  }

  onAddEvent(item: any): void {
    const line = document.getElementById(item.timeline);
    const scrollContainer = document.getElementById("scripter-container");

    if (line != null && scrollContainer != null) {

      let left = Math.floor((item.xPos + scrollContainer.scrollLeft - line.offsetLeft) / 41) * 41;

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
}
