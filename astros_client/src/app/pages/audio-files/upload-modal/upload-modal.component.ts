import { HttpClient, HttpEventType } from '@angular/common/http';
import { Component, OnInit } from '@angular/core';
import { faFileAudio, faTrash} from '@fortawesome/free-solid-svg-icons';

import { ModalBaseComponent } from 'src/app/modal';
import { FileUpload } from 'src/app/models/upload-file';
import { ModalCallbackEvent } from 'src/app/shared/modal-resources';
import { NgFor, NgStyle, DecimalPipe } from '@angular/common';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';

@Component({
    selector: 'app-upload-modal',
    templateUrl: './upload-modal.component.html',
    styleUrls: ['./upload-modal.component.scss'],
    standalone: true,
    imports: [NgFor, NgStyle, FontAwesomeModule, DecimalPipe]
})
export class UploadModalComponent extends ModalBaseComponent implements OnInit {

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
    this.uploadQueue = new Array<any>();
    this.isUploading = false;
  }

  override ngOnInit(): void {
  }

  removeFile(name: string){
    const idx = this.uploadQueue
    .map((file) => { return file.fileData.name })
    .indexOf(name);

    this.uploadQueue.splice(idx, 1);
  }

  addToQueue(evt: any){
    for (const file of evt.target.files){
      this.uploadQueue.push(new FileUpload(file));
    }
  }
  

  uploadAll(){
    this.isUploading = true;

    for (const file of this.uploadQueue){
      const formData = new FormData();
      
      formData.append('file', file.fileData);

      
     
      file.subscription = this.http.post(this.path, formData, {
          reportProgress: true,
          observe: 'events'
        }).subscribe( (evt) =>{
          if (evt.type === HttpEventType.UploadProgress && evt.total){
            file.uploadProgress = Math.round(100 * (evt.loaded / evt.total))
          }
        });
    }
  }

  cancelAll(){
    for (const file of this.uploadQueue){
      file.subscription?.unsubscribe();
    }
    this.isUploading = true;
  }

  reset(){
    for (const file of this.uploadQueue){
      file.subscription?.unsubscribe();
      file.subscription = undefined;
      file.uploadProgress = undefined;
    }

    this.uploadQueue.splice(0, this.uploadQueue.length);
    this.isUploading = false;
  }

  closeModal(){
    this.modalCallback.emit({id: ModalCallbackEvent.refresh});
  }

}
