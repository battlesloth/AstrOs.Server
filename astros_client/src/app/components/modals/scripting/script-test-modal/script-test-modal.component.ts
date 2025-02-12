import { Component, OnInit } from '@angular/core';
import {
  AstrOsConstants,
  ScriptResponse,
  TransmissionStatus,
  TransmissionType,
} from 'astros-common';
import { ScriptsService } from 'src/app/services/scripts/scripts.service';
import { WebsocketService } from 'src/app/services/websocket/websocket.service';
import { BaseEventModalComponent } from '../base-event-modal/base-event-modal.component';

interface Caption {
  str: string;
}

export class ScriptTestModalResources {
  public static scriptId = 'scriptId';
  public static locations = 'locations';
}

@Component({
  selector: 'app-script-test-modal',
  templateUrl: './script-test-modal.component.html',
  styleUrls: [
    '../base-event-modal/base-event-modal.component.scss',
    './script-test-modal.component.scss',
  ],
  standalone: true,
})
export class ScriptTestModalComponent
  extends BaseEventModalComponent
  implements OnInit
{
  uploadInProgress = true;
  runDisabled = true;

  coreUpload: TransmissionStatus = TransmissionStatus.sending;
  domeUpload: TransmissionStatus = TransmissionStatus.sending;
  bodyUpload: TransmissionStatus = TransmissionStatus.sending;

  coreCaption: Caption = { str: 'Uploading' };
  domeCaption: Caption = { str: 'Uploading' };
  bodyCaption: Caption = { str: 'Uploading' };

  status: string;

  scriptId = '';

  constructor(
    private socket: WebsocketService,
    private scriptService: ScriptsService,
  ) {
    super();
    this.status = 'Uploading script...';

    this.socket.messages.subscribe((msg: unknown) => {
      if (msg && typeof msg === 'object' && 'type' in msg) {
        if (msg.type === TransmissionType.script) {
          this.statusUpdate(msg as ScriptResponse);
        }
      }
    });
  }

  ngOnInit(): void {
    this.scriptId = this.resources.get(
      ScriptTestModalResources.scriptId,
    ) as string;
    const locations = this.resources.get(
      ScriptTestModalResources.locations,
    ) as number[];

    let hasBody = false;
    let hasCore = false;
    let hasDome = false;

    locations.forEach((location: number) => {
      switch (location) {
        case 1:
          hasBody = true;
          break;
        case 2:
          hasCore = true;
          break;
        case 3:
          hasDome = true;
          break;
      }
    });

    this.setInitialUploadStatus(hasBody, hasCore, hasDome);

    const observer = {
      next: (result: unknown) => console.log(result),
      error: (err: unknown) => {
        console.error(err);
        this.status = 'Error requesting Script Upload';
        this.coreUpload = TransmissionStatus.failed;
        this.coreCaption.str = 'Failed';
        this.domeUpload = TransmissionStatus.failed;
        this.domeCaption.str = 'Failed';
        this.bodyUpload = TransmissionStatus.failed;
        this.bodyCaption.str = 'Failed';
      },
    };

    if (this.scriptId != '') {
      this.scriptService.uploadScript(this.scriptId).subscribe(observer);
    } else {
      this.status = 'Script ID missing, close dialog to continue.';
    }
  }

  runClicked() {
    console.log(`Running script: ${this.scriptId}`);
    this.scriptService.runScript(this.scriptId).subscribe();
    this.closeModal();
  }

  setInitialUploadStatus(hasBody: boolean, hasCore: boolean, hasDome: boolean) {
    if (hasBody) {
      this.bodyUpload = TransmissionStatus.sending;
      this.bodyCaption.str = 'Uploading';
    } else {
      this.bodyUpload = TransmissionStatus.success;
      this.bodyCaption.str = 'Not Assigned';
    }

    if (hasCore) {
      this.coreUpload = TransmissionStatus.sending;
      this.coreCaption.str = 'Uploading';
    } else {
      this.coreUpload = TransmissionStatus.success;
      this.coreCaption.str = 'Not Assigned';
    }

    if (hasDome) {
      this.domeUpload = TransmissionStatus.sending;
      this.domeCaption.str = 'Uploading';
    } else {
      this.domeUpload = TransmissionStatus.success;
      this.domeCaption.str = 'Not Assigned';
    }
  }

  statusUpdate(msg: ScriptResponse) {
    switch (msg.locationId) {
      case AstrOsConstants.BODY:
        this.bodyUpload = msg.status;
        this.setCaption(this.bodyCaption, msg.status);
        break;
      case AstrOsConstants.CORE:
        this.coreUpload = msg.status;
        this.setCaption(this.coreCaption, msg.status);
        break;
      case AstrOsConstants.DOME:
        this.domeUpload = msg.status;
        this.setCaption(this.domeCaption, msg.status);
        break;
    }

    if (this.coreUpload > 1 && this.domeUpload > 1 && this.bodyUpload > 1) {
      this.status = 'Upload Complete.';
      this.uploadInProgress = false;
      if (this.coreUpload + this.domeUpload + this.bodyUpload >= 6) {
        this.runDisabled = false;
      }
    }
  }

  setCaption(caption: Caption, status: TransmissionStatus) {
    switch (status) {
      case TransmissionStatus.success:
        caption.str = 'Success';
        break;
      case TransmissionStatus.failed:
        caption.str = 'Failed';
        break;
    }
  }
}
