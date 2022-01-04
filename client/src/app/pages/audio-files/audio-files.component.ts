import { Component, OnInit } from '@angular/core';
import { faTrash } from '@fortawesome/free-solid-svg-icons';
import { AudioFile } from 'src/app/models/audio-file';
import { AudioService } from 'src/app/services/audio/audio.service';

@Component({
  selector: 'app-audio-files',
  templateUrl: './audio-files.component.html',
  styleUrls: ['./audio-files.component.scss']
})
export class AudioFilesComponent implements OnInit {

  faTrash = faTrash;

  audioFiles: Array<AudioFile>;

  constructor(private audioService: AudioService) { 
    this.audioFiles = new Array<AudioFile>();

  }

  ngOnInit(): void {
    const observer = {
      next: (result: AudioFile[]) => this.audioFiles = result,
      error: (err: any) => console.error(err)
    };

    this.audioService.getAudioFiles().subscribe(observer);
  }

  uploadFile(){

  }

  remove(){

  }
}
