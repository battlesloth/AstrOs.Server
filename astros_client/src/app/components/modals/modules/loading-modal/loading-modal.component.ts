import { Component, OnInit } from '@angular/core';
import { WebsocketService } from 'src/app/services/websocket/websocket.service';
import { ControllerService } from '@src/services';
import {
  AstrOsLocationCollection,
  ControllersResponse,
  ControlModule,
  TransmissionType,
} from 'astros-common';
import { Subscription } from 'rxjs';
import { ModalCallbackEvent } from '../..//modal-base/modal-callback-event';
import { ModalBaseComponent } from '../../modal-base/modal-base.component';

export class LoadingModalResources {
  public static closeEvent = 'loading_closeEvent';
}

export interface LoadingModalResponse {
  controllers: ControlModule[];
  locations: AstrOsLocationCollection;
}

@Component({
  selector: 'app-loading-modal',
  templateUrl: './loading-modal.component.html',
  styleUrls: ['./loading-modal.component.scss'],
  standalone: true,
})
export class LoadingModalComponent
  extends ModalBaseComponent
  implements OnInit
{
  subscription!: Subscription;

  message = 'Loading Controllers...';
  controllersMsg = TransmissionType.controllers;
  locations!: AstrOsLocationCollection;
  controllers!: ControllersResponse;

  locationsLoaded = false;
  controllersLoaded = false;

  disableButton = true;

  constructor(
    private socket: WebsocketService,
    private controllerService: ControllerService,
  ) {
    super();
  }

  ngOnInit(): void {
    const locationsObserver = {
      next: (result: AstrOsLocationCollection) => {
        console.log('Loaded locations');
        this.locations = result;
        this.locationsLoaded = true;
        this.checkLoadedState();
      },
      error: (err: unknown) => console.error(err),
    };

    this.controllerService.getLoadedLocations().subscribe(locationsObserver);

    const observer = {
      next: (_: unknown) => {
        console.log('Synced controllers');
      },
      error: (err: unknown) => console.error(err),
    };

    this.controllerService.syncControllers().subscribe(observer);

    this.subscription = this.socket.messages.subscribe((msg: unknown) => {
      console.log('Received message', msg);
      if (msg && typeof msg === 'object' && 'type' in msg)
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
        this.message = 'Failed to load controllers, using cached values.';
      }
    }
  }

  closeModal(): void {
    this.subscription?.unsubscribe();
    const evt = new ModalCallbackEvent(LoadingModalResources.closeEvent, {
      controllers: this.controllers.controllers,
      locations: this.locations,
    });

    this.modalCallback.emit(evt);
  }
}
