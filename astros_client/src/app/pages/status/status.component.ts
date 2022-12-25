import { AfterViewInit, Component, ElementRef, Renderer2, ViewChild } from '@angular/core';
import { WebsocketService } from 'src/app/services/websocket/websocket.service';

@Component({
  selector: 'app-status',
  templateUrl: './status.component.html',
  styleUrls: ['./status.component.scss']
})
export class StatusComponent implements AfterViewInit {

  @ViewChild('coreDown', { static: false }) coreDownEl!: ElementRef;
  @ViewChild('domeDown', { static: false }) domeDownEl!: ElementRef;
  @ViewChild('bodyDown', { static: false }) bodyDownEl!: ElementRef;

  @ViewChild('coreNotSynced', { static: false }) coreNotSyncedEl!: ElementRef;
  @ViewChild('domeNotSynced', { static: false }) domeNotSyncedEl!: ElementRef;
  @ViewChild('bodyNotSynced', { static: false }) bodyNotSyncedEl!: ElementRef;

  private coreUp: boolean;
  private domeUp: boolean;
  private bodyUp: boolean;

  private coreSynced: boolean;
  private domeSynced: boolean;
  private bodySynced: boolean;

  constructor(private renderer: Renderer2, private socket: WebsocketService ) {
    
    this.socket.messages.subscribe((msg: any)=>{

      if (msg.type === 'status'){
        this.statusUpdate(msg);
      }
    });

    this.coreUp = true;
    this.domeUp = true;
    this.bodyUp = true;

    this.coreSynced = true;
    this.domeSynced = true;
    this.bodySynced = true;
  }
  
  ngAfterViewInit(): void {
  }

  ngOnDestroy(): void {
  }

  statusUpdate(message: any) {
     {
      switch (message.module) {
        case 'core':
          this.coreUp = this.handleStatus(message.status === 'up', this.coreDownEl, this.coreUp);
          if (this.coreUp){
            this.coreSynced = this.handleStatus(message.synced, this.coreNotSyncedEl, this.coreSynced);
          }
          break;
        case 'dome':
          this.domeUp = this.handleStatus(message.status === 'up', this.domeDownEl, this.domeUp);
          if (this.domeUp){
            this.domeSynced = this.handleStatus(message.synced, this.domeNotSyncedEl, this.domeSynced);
          }
          break;
        case 'body':
          this.bodyUp = this.handleStatus(message.status === 'up', this.bodyDownEl, this.bodyUp);
          if (this.bodyUp){
            this.bodySynced = this.handleStatus(message.synced, this.bodyNotSyncedEl, this.bodySynced);
          }
          break;
        case 'legs':
          break;
      }
    }
  }

  handleStatus(status: boolean, el: ElementRef, isUp: boolean): boolean {
    if (status) {
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


