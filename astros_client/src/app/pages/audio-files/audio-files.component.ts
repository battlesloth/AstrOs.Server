import { Component, OnInit, ViewChild, ViewContainerRef } from '@angular/core';
import { faPlay, faTrash } from '@fortawesome/free-solid-svg-icons';
import { AudioFile } from 'astros-common';
import { AudioService } from 'src/app/services/audio/audio.service';
import { SnackbarService } from 'src/app/services/snackbar/snackbar.service';
import { NgFor, DatePipe } from '@angular/common';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import {
  ModalComponent,
  ConfirmModalComponent,
  ConfirmModalResources,
  UploadModalComponent,
  UploadModalResources,
} from '@src/components/modals';
import { ModalCallbackEvent } from '../../components/modals/modal-base/modal-callback-event';
import { ModalService } from '@src/services';

interface DeleteConfirmEvent {
  id: string;
  val: string;
}

@Component({
  selector: 'app-audio-files',
  templateUrl: './audio-files.component.html',
  styleUrls: ['./audio-files.component.scss'],
  imports: [NgFor, FontAwesomeModule, ModalComponent, DatePipe],
})
export class AudioFilesComponent implements OnInit {
  @ViewChild('modalContainer', { read: ViewContainerRef })
  container!: ViewContainerRef;

  faTrash = faTrash;
  faPlay = faPlay;

  audioFiles: AudioFile[];

  constructor(
    private snackBar: SnackbarService,
    private modalService: ModalService,
    private audioService: AudioService,
  ) {
    this.audioFiles = new Array<AudioFile>();
  }

  ngOnInit(): void {
    const observer = {
      next: (result: AudioFile[]) => (this.audioFiles = result),
      error: (err: unknown) => console.error(err),
    };

    this.audioService.getAudioFiles().subscribe(observer);
  }

  playFile(_: string) {
    this.snackBar.okToast('TODO: impelement this!');
  }

  uploadFile() {
    this.container.clear();

    const component = this.container.createComponent(UploadModalComponent);

    const modalResources = new Map<string, unknown>();
    component.instance.resources = modalResources;
    component.instance.modalCallback.subscribe((evt: ModalCallbackEvent) => {
      this.modalCallback(evt);
    });
    this.modalService.open('audio-files-modal');
  }

  removeFile(id: string) {
    this.container.clear();

    const idx = this.audioFiles
      .map((f) => {
        return f.id;
      })
      .indexOf(id);

    const fileName = this.audioFiles[idx].fileName;

    const modalResources = new Map<string, unknown>();
    modalResources.set(ConfirmModalResources.action, 'Confirm Delete');
    modalResources.set(
      ConfirmModalResources.message,
      `Are you sure you want to delete ${fileName}?`,
    );
    modalResources.set(ConfirmModalResources.confirmEvent, {
      id: 'audiofile_delete',
      val: id,
    });

    const component = this.container.createComponent(ConfirmModalComponent);

    component.instance.resources = modalResources;
    component.instance.modalCallback.subscribe((evt: ModalCallbackEvent) => {
      this.modalCallback(evt);
    });

    this.modalService.open('audio-files-modal');
  }

  modalCallback(evt: ModalCallbackEvent) {
    switch (evt.type) {
      case ConfirmModalResources.confirmEvent: {
        const val = evt.value as DeleteConfirmEvent;
        if (val.id === 'audiofile_delete') {
          this.remove(val.val as string);
        }
        break;
      }
      case UploadModalResources.refreshEvent:
        this.refreshAudioFiles();
        break;
    }

    this.modalService.close('audio-files-modal');
    this.container.clear();
  }

  refreshAudioFiles() {
    const observer = {
      next: (result: AudioFile[]) => (this.audioFiles = result),
      error: (err: unknown) => console.error(err),
    };

    this.audioService.getAudioFiles().subscribe(observer);
  }

  remove(id: string) {
    const observer = {
      next: (result: unknown) => {
        if (result && typeof result === 'object' && 'success' in result) {
          if (result.success) {
            const idx = this.audioFiles
              .map((f) => {
                return f.id;
              })
              .indexOf(id);

            this.audioFiles.splice(idx, 1);

            this.snackBar.okToast('File deleted!');
          } else {
            this.snackBar.okToast('File delete failed!');
          }
        }
      },
      error: (err: unknown) => {
        this.snackBar.okToast('File delete failed!');
        console.error(err);
      },
    };

    this.audioService.removeAudioFile(id).subscribe(observer);
  }
}
