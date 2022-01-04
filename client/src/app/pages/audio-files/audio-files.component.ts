import { Component, OnInit } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { faPlay, faTrash } from '@fortawesome/free-solid-svg-icons';
import { AudioFile } from 'src/app/models/audio-file';
import { AudioService } from 'src/app/services/audio/audio.service';

@Component({
  selector: 'app-audio-files',
  templateUrl: './audio-files.component.html',
  styleUrls: ['./audio-files.component.scss']
})
export class AudioFilesComponent implements OnInit {

  faTrash = faTrash;
  faPlay = faPlay;

  audioFiles: Array<AudioFile>;

  constructor(private snackBar: MatSnackBar,private audioService: AudioService) { 
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
    this.snackBar.open('TODO: impelement this!', 'OK', { duration: 2000 });
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
