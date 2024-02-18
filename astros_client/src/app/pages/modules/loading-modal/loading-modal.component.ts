import { AfterViewInit, Component, OnInit } from '@angular/core';
import { BaseEventModalComponent } from '../../scripter/modals/base-event-modal/base-event-modal.component';
import { WebsocketService } from 'src/app/services/websocket/websocket.service';
import { ControllersResponse } from 'astros-common';
import { TransmissionType } from 'astros-common/astros_enums'
import { ControllerService } from 'src/app/services/controllers/controller.service';

@Component({
  selector: 'app-loading-modal',
  templateUrl: './loading-modal.component.html',
  styleUrls: ['./loading-modal.component.scss']
})
export class LoadingModalComponent extends BaseEventModalComponent implements
  OnInit, AfterViewInit {

  controllersMsg = TransmissionType.controllers;

  constructor(private socket: WebsocketService,
    private controllerService: ControllerService) {
    super();

    this.socket.messages.subscribe((msg: any) => {
      console.log(`LoadingModalComponent: ${msg.type} ${JSON.stringify(msg)}`);
      if (msg.type === this.controllersMsg) {
        this.controllersReceived(msg as ControllersResponse);
      }
    });
  }

  controllersReceived(response: ControllersResponse) {
    if (response.success) {
      this.closeModal();
    } else {

    }
  }

  override ngOnInit(): void {

    const observer = {
      next: (result: any) => { },
      error: (err: any) => console.error(err)
    };

    this.controllerService.syncControllers().subscribe(observer);
  }

  ngAfterViewInit(): void {
  }
}
