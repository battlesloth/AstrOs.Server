import { Component, OnInit } from '@angular/core';
import { AudioFile, ScriptEvent } from 'astros-common';
import { AudioService } from 'src/app/services/audio/audio.service';
import { ModalCallbackEvent, ModalResources } from 'src/app/shared/modal-resources';
import { BaseEventModalComponent } from '../base-event-modal/base-event-modal.component';

@Component({
  selector: 'app-audio-event-modal',
  templateUrl: './audio-event-modal.component.html',
  styleUrls: ['../base-event-modal/base-event-modal.component.scss','./audio-event-modal.component.scss']
})
export class AudioEventModalComponent extends BaseEventModalComponent implements OnInit {

  audioFiles: Array<AudioFile>;

  selectedFile: string;

  constructor(private audioService: AudioService) { 
    super();
    this.audioFiles = new Array<AudioFile>();
    this.selectedFile = '0';

    const observer = {
      next: (result: AudioFile[]) => this.audioFiles = result,
      error: (err: any) => console.error(err)
    };

    this.audioService.getAudioFiles().subscribe(observer);

  }

  override ngOnInit(): void {

    if (this.resources.has(ModalResources.callbackType)){
      this.callbackType = this.resources.get(ModalResources.callbackType);
    }

    if (this.callbackType === ModalCallbackEvent.editEvent){
      var element = document.getElementById("remove_button");
      element?.classList.remove("hidden");
    }

    this.scriptEvent = <ScriptEvent> this.resources.get(ModalResources.scriptEvent);
    
    if (this.scriptEvent.dataJson != ''){
      const payload = JSON.parse(this.scriptEvent.dataJson);
      this.selectedFile = payload.value;
    }
    
    this.originalEventTime = this.scriptEvent.time;
    this.eventTime = this.scriptEvent.time;
  }

  addEvent(){
    if (+this.eventTime > this.maxTime){
      this.errorMessage = `Event time cannot be larger than ${this.maxTime}`;
      return;
    }
   
    this.scriptEvent.time = +this.eventTime;
    this.scriptEvent.dataJson = JSON.stringify({value: this.selectedFile});

    this.modalCallback.emit({
      id: this.callbackType,
      scriptEvent: this.scriptEvent,
      originalEventTime: this.originalEventTime
    });
  }
}
