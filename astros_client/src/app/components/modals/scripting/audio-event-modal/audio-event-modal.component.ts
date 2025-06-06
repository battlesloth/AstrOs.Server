import { Component, OnInit } from '@angular/core';
import { AudioFile, ScriptEvent } from 'astros-common';
import { AudioService } from 'src/app/services/audio/audio.service';
import {
  BaseEventModalComponent,
  ScriptEventModalResources,
} from '../base-event-modal/base-event-modal.component';
import { FormsModule } from '@angular/forms';
import { NgFor, DecimalPipe } from '@angular/common';
import { ModalCallbackEvent } from '../../modal-base/modal-callback-event';

export class AudioEventModalResources {
  public static audioFiles = 'audioFiles';
  public static selectedFile = 'selectedFile';
}

@Component({
  selector: 'app-audio-event-modal',
  templateUrl: './audio-event-modal.component.html',
  styleUrls: [
    '../base-event-modal/base-event-modal.component.scss',
    './audio-event-modal.component.scss',
  ],
  imports: [FormsModule, NgFor, DecimalPipe],
})
export class AudioEventModalComponent
  extends BaseEventModalComponent
  implements OnInit
{
  audioFiles: AudioFile[];

  selectedFile: string;

  constructor(private audioService: AudioService) {
    super();
    this.audioFiles = new Array<AudioFile>();
    this.selectedFile = '0';

    const observer = {
      next: (result: AudioFile[]) => (this.audioFiles = result),
      error: (err: unknown) => console.error(err),
    };

    this.audioService.getAudioFiles().subscribe(observer);
  }

  ngOnInit(): void {
    if (this.resources.has(ScriptEventModalResources.callbackType)) {
      this.callbackType = this.resources.get(
        ScriptEventModalResources.callbackType,
      ) as string;
    }

    if (this.callbackType === ScriptEventModalResources.editEvent) {
      const element = document.getElementById('remove_button');
      element?.classList.remove('hidden');
    }

    this.scriptEvent = this.resources.get(
      ScriptEventModalResources.scriptEvent,
    ) as ScriptEvent;

    this.selectedFile = 'not implemented';

    this.originalEventTime = this.scriptEvent.time / this.timeFactor;
    this.eventTime = this.scriptEvent.time / this.timeFactor;
  }

  addEvent() {
    if (+this.eventTime > this.maxTime) {
      this.errorMessage = `Event time cannot be larger than ${this.maxTime / this.timeFactor}`;
      return;
    }

    this.scriptEvent.time = +this.eventTime * this.timeFactor;

    const evt = new ModalCallbackEvent(this.callbackType, {
      id: this.callbackType,
      scriptEvent: this.scriptEvent,
      time: this.originalEventTime * this.timeFactor,
    });

    this.modalCallback.emit(evt);
  }
}
