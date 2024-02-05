import { Injectable } from '@angular/core';
import { ControllerStatus, AstrOsConstants, StatusResponse, TransmissionType } from 'astros-common';
import { Subject, throwError } from 'rxjs';
import { WebsocketService } from '../websocket/websocket.service';

@Injectable({
  providedIn: 'root'
})
export class StatusService {

  private coreState: ControllerStatus = ControllerStatus.down;
  coreStateObserver: Subject<ControllerStatus> = new Subject<ControllerStatus>();

  private domeState: ControllerStatus = ControllerStatus.down;
  domeStateObserver: Subject<ControllerStatus> = new Subject<ControllerStatus>();

  private bodyState: ControllerStatus = ControllerStatus.down;
  bodyStateObserver: Subject<ControllerStatus> = new Subject<ControllerStatus>();

  constructor(private socket: WebsocketService) {

    console.log('status started...')
    this.socket.messages.subscribe((msg: any) => {

      if (msg.type === TransmissionType.status) {
        this.statusUpdate(msg as StatusResponse);
      }
    });

    this.coreStateObserver.subscribe((value) => { this.coreState = value });
    this.domeStateObserver.subscribe((value) => { this.domeState = value });
    this.bodyStateObserver.subscribe((value) => { this.bodyState = value });
  }

  getCoreStatus(): ControllerStatus {
    return this.coreState;
  }

  getDomeStatus(): ControllerStatus {
    return this.domeState;
  }

  getBodyStatus(): ControllerStatus {
    return this.bodyState;
  }

  statusUpdate(status: StatusResponse) {
    {
      switch (status.controllerLocation) {
        case AstrOsConstants.CORE:
          this.setStatus(status, this.coreStateObserver);
          break;
        case AstrOsConstants.DOME:
          this.setStatus(status, this.domeStateObserver);
          break;
        case AstrOsConstants.BODY:
          this.setStatus(status, this.bodyStateObserver);
          break;
      }
    }
  }

  setStatus(status: StatusResponse, subject: Subject<ControllerStatus>) {
    if (!status.up) {
      subject.next(ControllerStatus.down);
    } else if (!status.synced) {
      subject.next(ControllerStatus.needsSynced);
    } else {
      subject.next(ControllerStatus.up);
    }
  }
}
