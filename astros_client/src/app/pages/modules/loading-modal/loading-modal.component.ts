import { Component, OnInit } from '@angular/core';
import { BaseEventModalComponent } from '../../scripter/modals/base-event-modal/base-event-modal.component';
import { WebsocketService } from 'src/app/services/websocket/websocket.service';
import { AstrOsLocationCollection, ControllersResponse, TransmissionType } from 'astros-common';
import { ControllerService } from 'src/app/services/controllers/controller.service';
import { ModalCallbackEvent } from 'src/app/shared/modal-resources';
import { Subscription } from 'rxjs';

@Component({
    selector: 'app-loading-modal',
    templateUrl: './loading-modal.component.html',
    styleUrls: ['./loading-modal.component.scss'],
    standalone: true
})
export class LoadingModalComponent extends BaseEventModalComponent implements OnInit {

  subscription!: Subscription;

  message = "Loading Controllers...";
  controllersMsg = TransmissionType.controllers;
  locations!: AstrOsLocationCollection;
  controllers!: ControllersResponse;

  locationsLoaded = false;
  controllersLoaded = false;

  disableButton = true;

  constructor(private socket: WebsocketService,
    private controllerService: ControllerService) {
    super();
  }

  override ngOnInit(): void {

    const locationsObserver = {
      next: (result: any) => {
        this.locations = result;
        this.locationsLoaded = true;
        this.controllersLoaded = true;
        this.controllers = { success: true, controllers: [] , type: TransmissionType.controllers, message: "" };
        this.checkLoadedState();
      },
      error: (err: any) => console.error(err)
    };

    this.controllerService.getLoadedLocations().subscribe(locationsObserver);

    return;
    const observer = {
      next: (result: any) => { },
      error: (err: any) => console.error(err)
    };

    this.controllerService.syncControllers().subscribe(observer);

    this.subscription = this.socket.messages.subscribe((msg: any) => {
      if (msg.type === this.controllersMsg) {
        this.controllers = msg as ControllersResponse;
        this.controllersLoaded = true;
        this.checkLoadedState();
      }
    });
  }

  checkLoadedState() {
    if (this.locationsLoaded && this.controllersLoaded) {
      if (this.controllers.success) {
        this.closeModal();
      } else {
        this.disableButton = false;
        this.message = "Failed to load controllers, using cached values.";
      }
    }
  }

  override closeModal(): void {
    //this.subscription.unsubscribe();
    this.modalCallback.emit({ id: ModalCallbackEvent.close, response: { controllers: this.controllers.controllers, locations: this.locations } });
  }
}
