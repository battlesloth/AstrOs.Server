import { AfterViewInit, Component, ElementRef, Renderer2, ViewChild } from '@angular/core';
import { WebsocketService } from 'src/app/services/websocket/websocket.service';

@Component({
  selector: 'app-status',
  templateUrl: './status.component.html',
  styleUrls: ['./status.component.scss']
})
export class StatusComponent implements AfterViewInit {

  @ViewChild('core', { static: false }) coreEl!: ElementRef;

  private coreUp: boolean;

  constructor(private renderer: Renderer2, private socket: WebsocketService ) {
    
    this.socket.messages.subscribe((msg: any)=>{

      if (msg.type === 'status'){
        this.statusUpdate(msg);
      }
    });

    this.coreUp = true;
  }
  
  ngAfterViewInit(): void {
  }

  ngOnDestroy(): void {
  }

  statusUpdate(message: any) {
     {
      switch (message.module) {
        case 'core':
          this.coreUp = this.handleStatus(message.status, this.coreEl, this.coreUp);
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


