import { Component, OnInit, ViewChild, ViewContainerRef } from '@angular/core';
import { Router } from '@angular/router';
import { faCopy, faPlay, faTrash, faUpload } from '@fortawesome/free-solid-svg-icons';
import { ScriptResponse, TransmissionStatus, TransmissionType, UploadStatus, Script } from 'astros-common';
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

  private initialStatusSet: boolean = false;

  faTrash = faTrash;
  faUpload = faUpload;
  faRun = faPlay;
  faCopy = faCopy;

  _scripts: Array<Script> = new Array<Script>();

  scripts: Array<Script>

  locationMap = new Map<number, string>([
    [1, 'body'],
    [2, 'core'],
    [3, 'dome']]);

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

  ngAfterViewChecked() {
    if (this.initialStatusSet) { return; }
    if (this.scripts.length === 0) { return; }

    for (const script of this.scripts) {
      this.updateUploadStatusElement('body', 1, script.id);
      this.updateUploadStatusElement('core', 2, script.id);
      this.updateUploadStatusElement('dome', 3, script.id);
    }

    this.initialStatusSet = true;
  }

  updateUploadStatusElement(element: string, locationId: number, scriptId: string): void {
    const el = document.getElementById(`${scriptId}_${element}`);
    if (el === null) { return; }
    const status = this.getUploadStatus(scriptId, locationId);
    el.classList.remove('uploaded');
    el.classList.remove('notuploaded');
    el.classList.remove('uploading');
    el.classList.add(status.s);

    const toolTip = document.getElementById(`${scriptId}_${element}_tooltip`);
    if (toolTip === null) { return; }
    toolTip.innerText = status.d;
  }

  setUploadingStatus(scriptId: string): void {

    const script = this.getScript(scriptId);

    if (!script) { return; }

    for (const location of this.locationMap.entries()) {
      if (script.deploymentStatusKvp.map((s) => { return s.key }).indexOf(location[0].toString()) > -1) {
        const el = document.getElementById(`${scriptId}_${location[1]}`);
        if (el === null) { continue; }
        el.classList.remove('uploaded');
        el.classList.remove('notuploaded');
        el.classList.add('uploading');

        const toolTip = document.getElementById(`${scriptId}_${location}_tooltip`);
        if (toolTip === null) { continue; }
        toolTip.innerText = 'Uploading...';
      }
    }
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
    modalResources.set(ModalResources.action, 'Delete')
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
      }
    };

    const idx = this.scripts
      .map((s) => { return s.id })
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

    this.updateUploadStatusElement(this.locationMap.get(msg.locationId) as string, msg.locationId, msg.scriptId);
  }

  getUploadStatus(id: string, locationId: number): { s: string, d: string } {
    let dateString = 'Not Uploaded';

    const script = this.getScript(id);

    if (!script) { return { s: 'notuploaded', d: dateString }; }

    const sidx = script.deploymentStatusKvp
      .map((s) => { return s.key })
      .indexOf(locationId.toString());

    if (sidx < 0) { return { s: 'notuploaded', d: dateString }; }

    const kvp = script.deploymentStatusKvp[sidx];
    let uploadStatus = kvp.value.value;


    if (kvp.value.date) {
      const uploaddate = new Date(kvp.value.date);
      const scriptdate = new Date(script.lastSaved)
      if (uploaddate < scriptdate) {
        uploadStatus = UploadStatus.notUploaded;
        dateString = ' Out of date ';
      } else {
        dateString = uploaddate.toLocaleDateString(navigator.language, { year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' });
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

  setUploadDate(id: string, controllerId: number, date: Date): void {
    const script = this.getScript(id);

    if (!script) { return; }

    const sidx = script.deploymentStatusKvp
      .map((s) => { return s.key })
      .indexOf(controllerId.toString());

    if (sidx < 0) { return; }

    script.deploymentStatusKvp[sidx].value.date = date;
  }

  getScript(id: string): Script | undefined {
    const idx = this.scripts
      .map((s) => { return s.id })
      .indexOf(id);

    if (idx < 0) {
      return undefined;
    }

    return this.scripts[idx];
  }
}
