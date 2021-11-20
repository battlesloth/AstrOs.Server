import { AfterViewInit, Component, ElementRef, OnInit, Renderer2, ViewChild } from '@angular/core';
import { last } from 'rxjs';
import { webSocket, WebSocketSubject } from 'rxjs/webSocket';

@Component({
  selector: 'app-status',
  templateUrl: './status.component.html',
  styleUrls: ['./status.component.scss']
})
export class StatusComponent implements AfterViewInit {

  @ViewChild('core', { static: false }) coreEl!: ElementRef;

  private coreUp: boolean;

  subject = webSocket('ws://localhost:5000');

  constructor(private renderer: Renderer2) {
    this.coreUp = true;

    this.subject.subscribe({
      next: (msg) => this.processMessage(msg),
      error: (err) => console.log(err),
      complete: () => console.log('socket disconnected')
    });
  }
  
  ngAfterViewInit(): void {
  }

  processMessage(message: any) {
    if (message['module']) {
      switch (message['module']) {
        case 'core':
          this.coreUp = this.handleStatus(message['status'], this.coreEl, this.coreUp);
          break;
        case 'dome':
          break;
        case 'body':
          break;
        case 'legs':
          break;
      }
    }
  }

  handleStatus(status: string, el: ElementRef, isUp: boolean): boolean {
    if (status === 'up') {
      if (!isUp) {
        this.renderer.setStyle(el.nativeElement, 'visibility', 'hidden');
      }
      return true;
    } else {
      if (isUp) {
        this.renderer.setStyle(el.nativeElement, 'visibility', 'visible');
      }
      return false;
    }
  }
}


