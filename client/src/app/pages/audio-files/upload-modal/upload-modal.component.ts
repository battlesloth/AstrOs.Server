import { Component, OnInit } from '@angular/core';
import { faTrash } from '@fortawesome/free-solid-svg-icons';
import { FileUploader } from 'ng2-file-upload';
import { ModalBaseComponent } from 'src/app/modal';
import { ModalCallbackEvent } from 'src/app/shared/modal-resources';

@Component({
  selector: 'app-upload-modal',
  templateUrl: './upload-modal.component.html',
  styleUrls: ['./upload-modal.component.scss']
})
export class UploadModalComponent extends ModalBaseComponent implements OnInit {

  faTrash = faTrash;

  uploader: FileUploader;
  response: string;

  constructor() { 
    super();

    this.uploader = new FileUploader({
      url: '/api/audio/savefile',
      disableMultipart: true,
      formatDataFunctionIsAsync: true,
      formatDataFunction:async (item: any) => {
        return new Promise( (resolve: any, reject: any) =>{
          resolve({
            name: item._file.name,
            length: item._file.size,
            contentType: item._file.type,
            date: new Date()
          })
        })
      }
    });

    this.response = '';

    this.uploader.response.subscribe(res => this.response = res);
  }

  override ngOnInit(): void {
  }

  removeFile(name: any){

  }

  uploadFile(){

  }

  closeModal(){
    this.modalCallback.emit({id: ModalCallbackEvent.close});
  }
}
