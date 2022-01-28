import { Injectable } from '@angular/core';
import { Guid } from 'guid-typescript';
import { Observable } from 'rxjs';
import { webSocket, WebSocketSubject } from 'rxjs/webSocket';
import { SocketSubscription } from 'src/app/models/socket_subscription';

@Injectable({
  providedIn: 'root'
})
export class WebsocketService {

  webSocket: WebSocketSubject<unknown>;

  subscriptions: Map<string, Map<Guid, Observable<any>>>;

  constructor() {
    this.subscriptions = new Map<string, Map<Guid, Observable<any>>>();

    this.webSocket = webSocket('ws://' + window.location.hostname + ':5000');

    this.webSocket.subscribe({
      next: (msg) => this.processMessage(msg),
      error: (err) => console.log(err),
      complete: () => console.log('socket disconnected')
    });
  }


  subscribe(sub: SocketSubscription) : Observable<any> {
    if (!this.subscriptions.has(sub.message)) {
      this.subscriptions.set(sub.message, new Map<Guid, Observable<any>>());
    }

    const observer = new Observable();

    this.subscriptions.get(sub.message)?.set(sub.id, observer);

    return observer;
  }

  unsubscribe(sub: SocketSubscription) {
    if (!this.subscriptions.has(sub.message)) {
      return;
    }

    this.subscriptions.get(sub.message)?.delete(sub.id);
  }

  processMessage(message: any) {

    try{
      const subs = this.subscriptions.get(message.type);

      if (subs) {
        for (const key of subs.keys()) {
          subs.get(key)?.go.next(message);
        }
      }
    } catch (err) {
      console.log(err);
    }
    
  }
}
