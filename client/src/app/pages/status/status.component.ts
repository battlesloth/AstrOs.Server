import { AfterViewInit, Component, ElementRef, OnInit, Renderer2, ViewChild } from '@angular/core';
import { webSocket, WebSocketSubject } from 'rxjs/webSocket';

@Component({
  selector: 'app-status',
  templateUrl: './status.component.html',
  styleUrls: ['./status.component.scss']
})
export class StatusComponent implements AfterViewInit {

  @ViewChild('core', { static: false }) coreEl!: ElementRef;

   subject = webSocket('ws://localhost:5000');

  constructor(private renderer: Renderer2) { 
    this.subject.subscribe({
      next:(msg) => this.processMessage(msg),
      error: (err) => console.log(err),
      complete: () => console.log('socket disconnected')
    });
  }

  processMessage(message: any){
    if (message['module']){
      switch(message['module']){
        case 'core':
          this.handleStatus(message['status'], this.coreEl)
          break;
        case 'dome':
          break;
        case 'body':
          break;
        case 'legs':
          break;
      }

      console.log(message['status']);
    }
  }

  handleStatus(status: string,el: ElementRef){
    if (status === 'up'){
      this.renderer.setStyle(el.nativeElement, 'visibility', 'hidden');
    } else {
      this.renderer.setStyle(el.nativeElement, 'visibility', 'visible');
    }
  }

  ngAfterViewInit(){
    console.log(this.coreEl.nativeElement)
  }
  
  ngOnInit(): void {
  }

}
