import {
  Component,
  OnInit,
  ViewChild,
  ViewContainerRef,
  AfterViewChecked,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import {
  faCopy,
  faPlay,
  faTrash,
  faUpload,
} from '@fortawesome/free-solid-svg-icons';
import {
  ScriptResponse,
  TransmissionStatus,
  TransmissionType,
  UploadStatus,
  Script,
  AstrOsConstants,
} from 'astros-common';
import { ScriptsService } from 'src/app/services/scripts/scripts.service';
import { SnackbarService } from 'src/app/services/snackbar/snackbar.service';
import { WebsocketService } from 'src/app/services/websocket/websocket.service';
import { NgFor } from '@angular/common';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import {
  ModalComponent,
  ConfirmModalComponent,
  ConfirmModalResources,
} from '@src/components/modals';
import { ModalCallbackEvent } from '../../components/modals/modal-base/modal-callback-event';
import { ModalService } from '@src/services';

interface DeleteConfirmEvent {
  id: string;
  val: string;
}

@Component({
  selector: 'app-scripts',
  templateUrl: './scripts.component.html',
  styleUrls: ['./scripts.component.scss'],
  imports: [NgFor, RouterLink, FontAwesomeModule, ModalComponent],
})
export class ScriptsComponent implements OnInit, AfterViewChecked {
  @ViewChild('modalContainer', { read: ViewContainerRef })
  container!: ViewContainerRef;

  private initialStatusSet = false;

  faTrash = faTrash;
  faUpload = faUpload;
  faRun = faPlay;
  faCopy = faCopy;

  _scripts: Script[] = new Array<Script>();

  scripts: Script[];

  locations =
  [
    AstrOsConstants.BODY,
    AstrOsConstants.CORE,
    AstrOsConstants.DOME
  ]

  constructor(
    private router: Router,
    private scriptService: ScriptsService,
    private socket: WebsocketService,
    private snackBarService: SnackbarService,
    private modalService: ModalService,
  ) {
    this.scripts = new Array<Script>();

    this.socket.messages.subscribe((msg: unknown) => {
      if (msg && typeof msg === 'object' && 'type' in msg)
        if (msg.type === TransmissionType.script) {
          this.statusUpdate(msg as ScriptResponse);
        }
    });
  }

  ngOnInit(): void {
    const observer = {
      next: (result: Script[]) => {
        this.scripts = result.sort((a, b) => {
          if (a.scriptName > b.scriptName) {
            return 1;
          }
          if (a.scriptName < b.scriptName) {
            return -1;
          }
          return 0;
        });
      },
      error: (err: unknown) => console.error(err),
    };

    this.scriptService.getAllScripts().subscribe(observer);
  }

  ngAfterViewChecked() {
    if (this.initialStatusSet) {
      return;
    }
    if (this.scripts.length === 0) {
      return;
    }

    for (const script of this.scripts) {
      this.updateUploadStatusElement(AstrOsConstants.BODY, script.id);
      this.updateUploadStatusElement(AstrOsConstants.CORE, script.id);
      this.updateUploadStatusElement(AstrOsConstants.DOME, script.id);
    }

    this.initialStatusSet = true;
  }

  updateUploadStatusElement(
    locationId: string,
    scriptId: string,
  ): void {
    const el = document.getElementById(`${scriptId}_${locationId}`);
    if (el === null) {
      return;
    }
    const status = this.getUploadStatus(scriptId, locationId);
    el.classList.remove('uploaded');
    el.classList.remove('notuploaded');
    el.classList.remove('uploading');
    el.classList.add(status.s);

    const toolTip = document.getElementById(`${scriptId}_${locationId}_tooltip`);
    if (toolTip === null) {
      return;
    }
    toolTip.innerText = status.d;
  }

  setUploadingStatus(scriptId: string): void {
    const script = this.getScript(scriptId);

    if (!script) {
      return;
    }

    for (const location of this.locations) {
      if (
        script.deploymentStatusKvp
          .map((s) => {
            return s.key;
          })
          .indexOf(location) > -1
      ) {
        const el = document.getElementById(`${scriptId}_${location}`);
        if (el === null) {
          continue;
        }
        el.classList.remove('uploaded');
        el.classList.remove('notuploaded');
        el.classList.add('uploading');

        const toolTip = document.getElementById(
          `${scriptId}_${location}_tooltip`,
        );
        if (toolTip === null) {
          continue;
        }
        toolTip.innerText = 'Uploading...';
      }
    }
  }

  newScript() {
    this.router.navigate(['scripter', '0']);
  }

  modalCallback(evt: ModalCallbackEvent) {
    switch (evt.type) {
      case ConfirmModalResources.confirmEvent: {
        {
          const evtData = evt.value as DeleteConfirmEvent;
          if (evtData.id === 'script_delete') {
            this.removeFile(evtData.val);
          }
          break;
        }
      }
    }

    this.modalService.close('scripts-modal');
    this.container.clear();
  }

  removeClicked(id: string) {
    this.container.clear();

    const modalResources = new Map<string, unknown>();
    modalResources.set(ConfirmModalResources.action, 'Delete');
    modalResources.set(
      ConfirmModalResources.message,
      `Are you sure you want to delete script?`,
    );
    modalResources.set(ConfirmModalResources.confirmEvent, {
      id: 'script_delete',
      val: id,
    });

    const component = this.container.createComponent(ConfirmModalComponent);

    component.instance.resources = modalResources;
    component.instance.modalCallback.subscribe((evt: ModalCallbackEvent) => {
      this.modalCallback(evt);
    });

    this.modalService.open('scripts-modal');
  }

  removeFile(id: string) {
    const idx = this.scripts
      .map((s) => {
        return s.id;
      })
      .indexOf(id);

    if (idx < 0) {
      return;
    }

    this.scripts.splice(idx, 1);

    this.scriptService.deleteScript(id).subscribe();
  }

  runClicked(id: string) {
    const idx = this.scripts
      .map((s) => {
        return s.id;
      })
      .indexOf(id);

    if (idx < 0) {
      return;
    }

    const observer = {
      next: (result: unknown) => {
        console.log(result);
        this.snackBarService.okToast('Script run queued!');
      },
      error: (err: unknown) => {
        console.error(err);
        this.snackBarService.okToast('Error requesting upload. Check logs.');
      },
    };

    this.scriptService.runScript(id).subscribe(observer);
  }

  copyClicked(id: string) {
    const idx = this.scripts
      .map((s) => {
        return s.id;
      })
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
            if (a.scriptName > b.scriptName) {
              return 1;
            }
            if (a.scriptName < b.scriptName) {
              return -1;
            }
            return 0;
          });
        }
      },
      error: (err: unknown) => {
        console.error(err);
        this.snackBarService.okToast('Error copying script. Check logs.');
      },
    };

    this.scriptService.copyScript(id).subscribe(observer);
  }

  uploadClicked(id: string) {
    const observer = {
      next: (result: unknown) => console.log(result),
      error: (err: unknown) => {
        console.error(err);
        this.snackBarService.okToast('Error requesting upload. Check logs.');
      },
    };

    const idx = this.scripts
      .map((s) => {
        return s.id;
      })
      .indexOf(id);

    if (idx < 0) {
      return;
    }

    this.scriptService.uploadScript(id).subscribe(observer);
    this.setUploadingStatus(id);
  }

  statusUpdate(msg: ScriptResponse) {
    if (msg.status === TransmissionStatus.success) {
      this.setUploadDate(msg.scriptId, msg.locationId, msg.date);
    }

    this.updateUploadStatusElement(
      msg.locationId,
      msg.scriptId,
    );
  }

  getUploadStatus(id: string, locationId: string): { s: string; d: string } {
    let dateString = 'Not Uploaded';

    const script = this.getScript(id);

    if (!script) {
      return { s: 'notuploaded', d: dateString };
    }

    const sidx = script.deploymentStatusKvp
      .map((s) => {
        return s.key;
      })
      .indexOf(locationId.toString());

    if (sidx < 0) {
      return { s: 'notuploaded', d: dateString };
    }

    const kvp = script.deploymentStatusKvp[sidx];
    let uploadStatus = kvp.value.value;

    if (kvp.value.date) {
      const uploaddate = new Date(kvp.value.date);
      const scriptdate = new Date(script.lastSaved);
      if (uploaddate < scriptdate) {
        uploadStatus = UploadStatus.notUploaded;
        dateString = ' Out of date ';
      } else {
        dateString = uploaddate.toLocaleDateString(navigator.language, {
          year: 'numeric',
          month: 'numeric',
          day: 'numeric',
          hour: 'numeric',
          minute: 'numeric',
        });
      }
    }

    return { s: this.getUploadStatusClass(uploadStatus), d: dateString };
  }

  getUploadStatusClass(status: UploadStatus) {
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

  setUploadDate(id: string, controllerId: string, date: Date): void {
    const script = this.getScript(id);

    if (!script) {
      return;
    }

    const sidx = script.deploymentStatusKvp
      .map((s) => {
        return s.key;
      })
      .indexOf(controllerId.toString());

    if (sidx < 0) {
      return;
    }

    script.deploymentStatusKvp[sidx].value.date = date;
  }

  getScript(id: string): Script | undefined {
    const idx = this.scripts
      .map((s) => {
        return s.id;
      })
      .indexOf(id);

    if (idx < 0) {
      return undefined;
    }

    return this.scripts[idx];
  }
}
