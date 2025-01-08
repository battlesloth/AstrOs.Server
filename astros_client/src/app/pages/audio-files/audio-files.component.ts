import { Component, OnInit, ViewChild, ViewContainerRef } from '@angular/core';
import { faPlay, faTrash } from '@fortawesome/free-solid-svg-icons';
import { ConfirmModalComponent, ModalService } from 'src/app/modal';
import { AudioFile } from 'astros-common';
import { AudioService } from 'src/app/services/audio/audio.service';
import { ModalCallbackEvent, ModalResources } from 'src/app/shared/modal-resources';
import { UploadModalComponent } from './upload-modal/upload-modal.component';
import { SnackbarService } from 'src/app/services/snackbar/snackbar.service';
import { NgFor, DatePipe } from '@angular/common';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { ModalComponent } from '../../modal/modal.component';

@Component({
    selector: 'app-audio-files',
    templateUrl: './audio-files.component.html',
    styleUrls: ['./audio-files.component.scss'],
    standalone: true,
    imports: [NgFor, FontAwesomeModule, ModalComponent, DatePipe]
})
export class AudioFilesComponent implements OnInit {
 
  @ViewChild('modalContainer', { read: ViewContainerRef }) container!: ViewContainerRef;
 

  faTrash = faTrash;
  faPlay = faPlay;

  audioFiles: AudioFile[];

  constructor(private snackBar: SnackbarService,
      private modalService: ModalService,
      private audioService: AudioService) { 
    this.audioFiles = new Array<AudioFile>();

  }

  ngOnInit(): void {
    const observer = {
      next: (result: AudioFile[]) => this.audioFiles = result,
      error: (err: any) => console.error(err)
    };

    this.audioService.getAudioFiles().subscribe(observer);
  }

  playFile(id: string){
    this.snackBar.okToast('TODO: impelement this!');
  }

  uploadFile(){
    this.container.clear();
    
    const component = this.container.createComponent(UploadModalComponent);

    const modalResources = new Map<string, any>();
    component.instance.resources = modalResources;
    component.instance.modalCallback.subscribe((evt: any) => {
      this.modalCallback(evt);
    });
    this.modalService.open('audio-files-modal');
  }

  removeFile(id: string){
    this.container.clear();

    const idx = this.audioFiles
          .map((f) => { return f.id })
          .indexOf(id);
          
    const fileName = this.audioFiles[idx].fileName;
  
    const modalResources = new Map<string, any>();
    modalResources.set(ModalResources.action, 'Confirm Delete')
    modalResources.set(ModalResources.message, `Are you sure you want to delete ${fileName}?`);
    modalResources.set(ModalResources.confirmEvent, {id: ModalCallbackEvent.delete, val: id});
    modalResources.set(ModalResources.closeEvent, {id: ModalCallbackEvent.close})

    const component = this.container.createComponent(ConfirmModalComponent);

    component.instance.resources = modalResources;
    component.instance.modalCallback.subscribe((evt: any) => {
      this.modalCallback(evt);
    });

    this.modalService.open('audio-files-modal');
  }

  modalCallback(evt: any) {

    switch (evt.id) {
      case ModalCallbackEvent.delete:
          this.remove(evt.val);
        break;
      case ModalCallbackEvent.refresh:
        const observer = {
          next: (result: AudioFile[]) => this.audioFiles = result,
          error: (err: any) => console.error(err)
        };
    
        this.audioService.getAudioFiles().subscribe(observer);
        break;

    }

    this.modalService.close('audio-files-modal');
    this.container.clear();
  }

  remove(id: string){
    const observer = {
      next: (result: any) => {
        if (result.success){
          const idx = this.audioFiles
          .map((f) => { return f.id })
          .indexOf(id);
          
          this.audioFiles.splice(idx, 1);

          this.snackBar.okToast('File deleted!');
        } else{
          this.snackBar.okToast('File delete failed!');  
        }
      },
      error: (err: any) => {
        this.snackBar.okToast('File delete failed!');
        console.error(err);
      }
    };

    this.audioService.removeAudioFile(id).subscribe(observer);
  }
}
