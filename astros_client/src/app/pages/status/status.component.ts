import { AfterViewInit, Component, ElementRef, Renderer2, ViewChild} from '@angular/core';
import { ControllerStatus } from 'astros-common';
import { StatusService } from 'src/app/services/status/status.service';

@Component({
    selector: 'app-status',
    templateUrl: './status.component.html',
    styleUrls: ['./status.component.scss'],
    standalone: true
})
export class StatusComponent implements AfterViewInit {

  @ViewChild('coreDown', { static: false }) coreDownEl!: ElementRef;
  @ViewChild('domeDown', { static: false }) domeDownEl!: ElementRef;
  @ViewChild('bodyDown', { static: false }) bodyDownEl!: ElementRef;

  @ViewChild('coreNotSynced', { static: false }) coreNotSyncedEl!: ElementRef;
  @ViewChild('domeNotSynced', { static: false }) domeNotSyncedEl!: ElementRef;
  @ViewChild('bodyNotSynced', { static: false }) bodyNotSyncedEl!: ElementRef;

  constructor(private renderer: Renderer2, private status: StatusService ) {
    
    this.status.coreStateObserver.subscribe(value => this.handleStatus(value, this.coreNotSyncedEl, this.coreDownEl));
    this.status.domeStateObserver.subscribe(value => this.handleStatus(value, this.domeNotSyncedEl, this.domeDownEl));
    this.status.bodyStateObserver.subscribe(value => this.handleStatus(value, this.bodyNotSyncedEl, this.bodyDownEl));
}
  
  ngAfterViewInit(): void {  
    this.handleStatus(this.status.getCoreStatus(), this.coreNotSyncedEl, this.coreDownEl);
    this.handleStatus(this.status.getDomeStatus(), this.domeNotSyncedEl, this.domeDownEl);
    this.handleStatus(this.status.getBodyStatus(), this.bodyNotSyncedEl, this.bodyDownEl);

  }

  handleStatus(status: ControllerStatus, syncEl: ElementRef, downEl: ElementRef){
    switch (status){
      case ControllerStatus.up:
        this.renderer.setStyle(syncEl.nativeElement, 'visibility', 'hidden');
        this.renderer.setStyle(downEl.nativeElement, 'visibility', 'hidden');
        break;
      case ControllerStatus.needsSynced:
        this.renderer.setStyle(syncEl.nativeElement, 'visibility', 'visible');
        this.renderer.setStyle(downEl.nativeElement, 'visibility', 'hidden');
        break;
      case ControllerStatus.down:
        this.renderer.setStyle(syncEl.nativeElement, 'visibility', 'hidden');
        this.renderer.setStyle(downEl.nativeElement, 'visibility', 'visible');
        break;
    } 
  }
}


