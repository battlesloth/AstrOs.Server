import { AfterViewInit, Component, ElementRef, Renderer2, ViewChild } from '@angular/core';
import { Guid } from 'guid-typescript';
import { webSocket } from 'rxjs/webSocket';
import { SocketSubscription } from 'src/app/models/socket_subscription';
import { WebsocketService } from 'src/app/services/websocket/websocket.service';

@Component({
  selector: 'app-status',
  templateUrl: './status.component.html',
  styleUrls: ['./status.component.scss']
})
export class StatusComponent implements AfterViewInit {

  @ViewChild('core', { static: false }) coreEl!: ElementRef;

  private coreUp: boolean;

  subscription: SocketSubscription;
  subject = webSocket('ws://localhost:5000');

  constructor(private renderer: Renderer2, private socket: WebsocketService ) {
    
    this.subscription = new SocketSubscription(Guid.create(), 'status', this.statusUpdate)
    
    this.socket.subscribe(this.subscription);

    this.coreUp = true;
  }
  
  ngAfterViewInit(): void {
  }

  ngOnDestroy(): void {
    this.socket.unsubscribe(this.subscription);
  }

  statusUpdate(message: any) {
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


