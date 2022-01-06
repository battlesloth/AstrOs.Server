import { Component, OnInit } from '@angular/core';
import { faFileAudio, faTrash} from '@fortawesome/free-solid-svg-icons';
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
  faFiles = faFileAudio;

  uploader: FileUploader;
  response: string;

  private token: string;

  constructor() { 
    super();

    this.response = '';
    
    this.token = localStorage.getItem('astros-token') || '';
    
    this.uploader = new FileUploader({
      url: '/api/audio/savefile',
      itemAlias: 'file'
    });

    //this.uploader = new FileUploader({
    //  url: '/api/audio/savefile',
    //  authToken: this.getToken(),
    //  disableMultipart: true,
    //  formatDataFunctionIsAsync: true,
    //  formatDataFunction:async (item: any) => {
    //    return new Promise( (resolve: any, reject: any) =>{
    //      resolve({
    //        name: item._file.name,
    //        length: item._file.size,
    //        contentType: item._file.type,
    //        date: new Date()
    //      })
    //    })
    //  }
    //});
//
    this.response = '';
//
    this.uploader.response.subscribe(res => {
      this.modalCallback.emit({id: ModalCallbackEvent.refresh});
      this.uploader.clearQueue();
      this.response = res;
    });
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
