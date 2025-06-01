import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { webSocket, WebSocketSubject } from 'rxjs/webSocket';

@Injectable({
  providedIn: 'root',
})
export class WebsocketService {
  webSocket: WebSocketSubject<unknown>;

  public messages: Observable<unknown>;

  constructor() {
    this.webSocket = webSocket('ws://' + window.location.hostname + ':5000');
    this.messages = this.webSocket.asObservable();
  }

  public sendMessage(msg: unknown) {
    this.webSocket.next(msg);
  }
}
