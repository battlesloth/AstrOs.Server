import { HttpClient, HttpEventType } from '@angular/common/http';
import { Component } from '@angular/core';
import { faFileAudio, faTrash } from '@fortawesome/free-solid-svg-icons';
import { ModalBaseComponent, } from '../modal-base/modal-base.component'; import { ModalCallbackEvent } from '../modal-base/modal-callback-event';
import { FileUpload } from 'src/app/models/upload-file';
import { NgFor, NgStyle, DecimalPipe } from '@angular/common';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';

export class UploadModalResources {
  public static message = 'message';
  public static refreshEvent = 'upload_refreshEvent';
  public static closeEvent = 'upload_closeEvent';
}

@Component({
  selector: 'app-upload-modal',
  templateUrl: './upload-modal.component.html',
  styleUrls: ['./upload-modal.component.scss'],
  standalone: true,
  imports: [NgFor, NgStyle, FontAwesomeModule, DecimalPipe]
})
export class UploadModalComponent extends ModalBaseComponent {

  faTrash = faTrash;
  faFiles = faFileAudio;

  uploadQueue: FileUpload[];
  isUploading: boolean;

  path = '/api/audio/savefile';

  response: string;

  private token: string;

  constructor(private http: HttpClient) {
    super();

    this.response = '';

    this.token = localStorage.getItem('astros-token') || '';
    this.uploadQueue = new Array<FileUpload>();
    this.isUploading = false;
  }

  removeFile(toRemove: unknown) {

    let filename = '';

    if (toRemove && typeof toRemove === 'object' && 'name' in toRemove){
      filename = toRemove.name as string;
    } else {
      filename = toRemove as string;
    }

    const idx = this.uploadQueue
      .map((file) => {
        if (typeof file.fileData === 'object' && 'name' in file.fileData) {
          return file.fileData.name
        }
        return file.fileData
      })
      .indexOf(filename);

    this.uploadQueue.splice(idx, 1);
  }

  addToQueue(evt: Event) {

    const files = (evt.target as HTMLInputElement).files;

    if (!files) {
      return;
    } 

    for (let i = 0; i < files.length; i++) {
      const file = files.item(i);
      if (file !== null) {
        this.uploadQueue.push(new FileUpload(file));
      }
    }
  }


  uploadAll() {
    this.isUploading = true;

    for (const file of this.uploadQueue) {
      const formData = new FormData();

      formData.append('file', file.fileData);

      file.subscription = this.http.post(this.path, formData, {
        reportProgress: true,
        observe: 'events'
      }).subscribe((evt) => {
        if (evt.type === HttpEventType.UploadProgress && evt.total) {
          file.uploadProgress = Math.round(100 * (evt.loaded / evt.total))
        }
      });
    }
  }

  cancelAll() {
    for (const file of this.uploadQueue) {
      file.subscription?.unsubscribe();
    }
    this.isUploading = true;
  }

  reset() {
    for (const file of this.uploadQueue) {
      file.subscription?.unsubscribe();
      file.subscription = undefined;
      file.uploadProgress = undefined;
    }

    this.uploadQueue.splice(0, this.uploadQueue.length);
    this.isUploading = false;
  }

  closeModal() {
    const evt = new ModalCallbackEvent(
      UploadModalResources.refreshEvent,
      null
    )
    this.modalCallback.emit(evt);
  }
}
