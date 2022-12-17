import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { faTrash, faUpload } from '@fortawesome/free-solid-svg-icons';
import { ControllerType, Script, TransmissionStatus, UploadStatus } from 'astros-common';
import { ScriptsService } from 'src/app/services/scripts/scripts.service';
import { WebsocketService } from 'src/app/services/websocket/websocket.service';

@Component({
  selector: 'app-scripts',
  templateUrl: './scripts.component.html',
  styleUrls: ['./scripts.component.scss']
})
export class ScriptsComponent implements OnInit {

  faTrash = faTrash;
  faUpload = faUpload;

  scripts: Array<Script>

  constructor(private router: Router, private scriptService: ScriptsService, private socket: WebsocketService) {
    this.scripts = new Array<Script>();

    this.socket.messages.subscribe((msg: any) => {

      if (msg.type === 'scriptUploadStatus') {
        this.statusUpdate(msg);
      }
    });

  }

  ngOnInit(): void {
    const observer = {
      next: (result: Script[]) => this.scripts = result,
      error: (err: any) => console.error(err)
    };

    this.scriptService.getAllScripts().subscribe(observer);
  }

  newScript() {
    this.router.navigate(['scripter', '0']);
  }

  removeClicked() {

  }

  uploadClicked(id: string) {
    const observer = {
      next: (result: any) => console.log(result),
      error: (err: any) => console.error(err)
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

    this.scriptService.uploadScript(id).subscribe();
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

  statusUpdate(msg: any) {

    const idx = this.scripts
      .map((s) => { return s.id })
      .indexOf(msg.scriptId as string);

    if (idx < 0) {
      return;
    }


    switch (msg.controller as ControllerType) {
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
