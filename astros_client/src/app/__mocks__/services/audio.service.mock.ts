import { Injectable } from "@angular/core";
import { AudioFile } from "astros-common";
import { Observable, of } from "rxjs";

@Injectable({
  providedIn: 'root',
})
export class AudioServiceMock {

  public getAudioFiles(): Observable<AudioFile[]> {
    return of([]);
  }

  public removeAudioFile(id: string): Observable<AudioFile[]> {
    return of([]);
  }
}