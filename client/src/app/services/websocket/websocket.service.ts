import { Injectable } from '@angular/core';
import { webSocket, WebSocketSubject } from 'rxjs/webSocket';

@Injectable({
  providedIn: 'root'
})
export class WebsocketService {

  webSocket: WebSocketSubject<unknown>;

  subscriptions: Map<string, SocketSubscription>

  constructor() {
    this.webSocket = webSocket('ws://' + window.location.hostname + ':5000');

    this.webSocket.subscribe({
      next: (msg) => this.processMessage(msg),
      error: (err) => console.log(err),
      complete: () => console.log('socket disconnected')
    });
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
}
