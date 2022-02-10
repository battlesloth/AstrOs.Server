import { Component, OnInit, ViewChild, ViewContainerRef } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { faPlay, faTrash } from '@fortawesome/free-solid-svg-icons';
import { ConfirmModalComponent, ModalService } from 'src/app/modal';
import { AudioFile } from 'astros-common';
import { AudioService } from 'src/app/services/audio/audio.service';
import { ModalCallbackEvent, ModalResources } from 'src/app/shared/modal-resources';
import { UploadModalComponent } from './upload-modal/upload-modal.component';

@Component({
  selector: 'app-audio-files',
  templateUrl: './audio-files.component.html',
  styleUrls: ['./audio-files.component.scss']
})
export class AudioFilesComponent implements OnInit {
 
  @ViewChild('modalContainer', { read: ViewContainerRef }) container!: ViewContainerRef;
 

  faTrash = faTrash;
  faPlay = faPlay;

  audioFiles: Array<AudioFile>;

  constructor(private snackBar: MatSnackBar, private modalService: ModalService, private audioService: AudioService) { 
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
    this.snackBar.open('TODO: impelement this!', 'OK', { duration: 2000 });
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

          this.snackBar.open('File deleted!', 'OK', { duration: 2000 });
        } else{
          this.snackBar.open('File delete failed!', 'OK', { duration: 2000 });  
        }
      },
      error: (err: any) => {
        this.snackBar.open('File delete failed!', 'OK', { duration: 2000 });
        console.error(err);
      }
    };

    this.audioService.removeAudioFile(id).subscribe(observer);
  }
}
