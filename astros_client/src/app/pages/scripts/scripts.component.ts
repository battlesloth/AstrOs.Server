import { Component, OnInit, ViewChild, ViewContainerRef } from '@angular/core';
import { Router } from '@angular/router';
import { faCopy, faPlay, faTrash, faUpload } from '@fortawesome/free-solid-svg-icons';
import { ControllerType, Script, ScriptResponse, TransmissionStatus, TransmissionType, UploadStatus } from 'astros-common';
import { ConfirmModalComponent, ModalService } from 'src/app/modal';
import { ScriptsService } from 'src/app/services/scripts/scripts.service';
import { SnackbarService } from 'src/app/services/snackbar/snackbar.service';
import { WebsocketService } from 'src/app/services/websocket/websocket.service';
import { ModalCallbackEvent, ModalResources } from 'src/app/shared/modal-resources';

@Component({
  selector: 'app-scripts',
  templateUrl: './scripts.component.html',
  styleUrls: ['./scripts.component.scss']
})
export class ScriptsComponent implements OnInit {

  @ViewChild('modalContainer', { read: ViewContainerRef }) container!: ViewContainerRef;

  faTrash = faTrash;
  faUpload = faUpload;
  faRun = faPlay;
  faCopy = faCopy;

  scripts: Array<Script>

  constructor(private router: Router,
    private scriptService: ScriptsService,
    private socket: WebsocketService,
    private snackBarService: SnackbarService,
    private modalService: ModalService) {
    this.scripts = new Array<Script>();

    this.socket.messages.subscribe((msg: any) => {
      if (msg.type === TransmissionType.script) {
        this.statusUpdate(msg as ScriptResponse);
      }
    });

  }

  ngOnInit(): void {
    const observer = {
      next: (result: Script[]) => {
        this.scripts = result.sort((a, b) => {
          if (a.scriptName > b.scriptName) { return 1; }
          if (a.scriptName < b.scriptName) { return -1; }
          return 0;
        });
      },
      error: (err: any) => console.error(err)
    };

    this.scriptService.getAllScripts().subscribe(observer);
  }

  newScript() {
    this.router.navigate(['scripter', '0']);
  }

  modalCallback(evt: any) {

    switch (evt.id) {
      case ModalCallbackEvent.delete:
        this.removeFile(evt.val);
        break;
    }

    this.modalService.close('scripts-modal');
    this.container.clear();
  }

  removeClicked(id: string) {
    this.container.clear();

    const modalResources = new Map<string, any>();
    modalResources.set(ModalResources.action, 'Confirm Delete')
    modalResources.set(ModalResources.message, `Are you sure you want to delete script?`);
    modalResources.set(ModalResources.confirmEvent, { id: ModalCallbackEvent.delete, val: id });
    modalResources.set(ModalResources.closeEvent, { id: ModalCallbackEvent.close })

    const component = this.container.createComponent(ConfirmModalComponent);

    component.instance.resources = modalResources;
    component.instance.modalCallback.subscribe((evt: any) => {
      this.modalCallback(evt);
    });

    this.modalService.open('scripts-modal');
  }

  removeFile(id: string) {
    const idx = this.scripts
      .map((s) => { return s.id })
      .indexOf(id);

    if (idx < 0) {
      return;
    }

    this.scripts.splice(idx, 1);

    this.scriptService.deleteScript(id).subscribe();
  }

  runClicked(id: string) {
    const idx = this.scripts
      .map((s) => { return s.id })
      .indexOf(id);

    if (idx < 0) {
      return;
    }

    const observer = {
      next: (result: any) => {
        console.log(result);
        this.snackBarService.okToast('Script run queued!');
      },
      error: (err: any) => {
        console.error(err);
        this.snackBarService.okToast('Error requesting upload. Check logs.');
      }
    }

    this.scriptService.runScript(id).subscribe(observer);
  }

  copyClicked(id: string) {
    const idx = this.scripts
      .map((s) => { return s.id })
      .indexOf(id);

    if (idx < 0) {
      return;
    }

    const observer = {
      next: (result: Script) => {
        if (result === undefined) {
          this.snackBarService.okToast('Error copying script. Check logs.');
        } else {
          this.scripts.push(result);

          this.scripts.sort((a, b) => {
            if (a.scriptName > b.scriptName) { return 1; }
            if (a.scriptName < b.scriptName) { return -1; }
            return 0;
          });
        }
      },
      error: (err: any) => {
        console.error(err);
        this.snackBarService.okToast('Error copying script. Check logs.');
      }
    }

    this.scriptService.copyScript(id).subscribe(observer);
  }

  uploadClicked(id: string) {
    const observer = {
      next: (result: any) => console.log(result),
      error: (err: any) => {
        console.error(err);
        this.snackBarService.okToast('Error requesting upload. Check logs.');
        this.scripts[idx].coreUploadStatus = UploadStatus.notUploaded;
        this.scripts[idx].domeUploadStatus = UploadStatus.notUploaded;
        this.scripts[idx].bodyUploadStatus = UploadStatus.notUploaded;
      }
    };

    const idx = this.scripts
      .map((s) => { return s.id })
      .indexOf(id);

    if (idx < 0) {
      return;
    }

    this.scripts[idx].coreUploadStatus = UploadStatus.uploading;
    this.scripts[idx].domeUploadStatus = UploadStatus.uploading;
    this.scripts[idx].bodyUploadStatus = UploadStatus.uploading;

    this.scriptService.uploadScript(id).subscribe(observer);
  }

  uploadStatus(status: UploadStatus) {
    switch (status) {
      case UploadStatus.notUploaded:
        return 'notuploaded';
      case UploadStatus.uploading:
        return 'uploading';
      case UploadStatus.uploaded:
        return 'uploaded';
      default:
        return 'notuploaded';
    }
  }

  statusUpdate(msg: ScriptResponse) {

    const idx = this.scripts
      .map((s) => { return s.id })
      .indexOf(msg.scriptId as string);

    if (idx < 0) {
      return;
    }

    switch (msg.controllerType as ControllerType) {
      case ControllerType.core:
        if (msg.status === TransmissionStatus.success) {
          this.scripts[idx].coreUploaded = msg.date;
          this.scripts[idx].coreUploadStatus = UploadStatus.uploaded;
        }
        else if (msg.status === TransmissionStatus.sending) {
          this.scripts[idx].coreUploadStatus = UploadStatus.uploading;
        }
        else if (msg.status === TransmissionStatus.failed) {
          this.scripts[idx].coreUploadStatus = UploadStatus.notUploaded;
        }
        break;
      case ControllerType.dome:
        if (msg.status === TransmissionStatus.success) {
          this.scripts[idx].domeUploaded = msg.date;
          this.scripts[idx].domeUploadStatus = UploadStatus.uploaded;
        }
        else if (msg.status === TransmissionStatus.sending) {
          this.scripts[idx].domeUploadStatus = UploadStatus.uploading;

        }
        else if (msg.status === TransmissionStatus.failed) {
          this.scripts[idx].domeUploadStatus = UploadStatus.notUploaded;
        }
        break;
      case ControllerType.body:
        if (msg.status === TransmissionStatus.success) {
          this.scripts[idx].bodyUploaded = msg.date;
          this.scripts[idx].bodyUploadStatus = UploadStatus.uploaded;
        }
        else if (msg.status === TransmissionStatus.sending) {
          this.scripts[idx].bodyUploadStatus = UploadStatus.uploading;
        }
        else if (msg.status === TransmissionStatus.failed) {
          this.scripts[idx].bodyUploadStatus = UploadStatus.notUploaded;
        }
        break;
    }
  }
}
