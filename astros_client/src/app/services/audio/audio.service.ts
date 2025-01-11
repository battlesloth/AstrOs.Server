import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { catchError, map, Observable, of, tap } from 'rxjs';
import { AudioFile } from 'astros-common';

@Injectable({
  providedIn: 'root'
})
export class AudioService {

  private token: string

  constructor(private http: HttpClient) {
    this.token = '';
  }

  public getAudioFiles(): Observable<AudioFile[]> {
    
    return this.http.get<AudioFile[]>(`/api/audio/all`, {
      headers: { Authorization: `Bearer ${this.getToken()}` }
    }).pipe(
      map((files: AudioFile[])=> files.sort((a: AudioFile, b: AudioFile)=>{
        if (a.fileName < b.fileName) return -1;
        if (a.fileName > b.fileName) return 1;
        return 0;
      }))
    ).pipe(tap(_ => console.log(`loaded audio files`)),
        catchError(this.handleError<AudioFile[]>('getAudioFiles'))
      );
  }

  public removeAudioFile(id: string): Observable<AudioFile[]> {
    return this.http.get<AudioFile[]>(`/api/audio/delete?id=${id}`, {
      headers: { Authorization: `Bearer ${this.getToken()}` }
    })
      .pipe(tap(_ => console.log(`deleted audio file id: ${id}`)),
        catchError(this.handleError<AudioFile[]>('removeAudioFile'))
      );
  }

  private getToken(): string {
    if (!this.token) {
      this.token = localStorage.getItem('astros-token') || '';
    }
    return this.token;
  }

  private handleError<T>(operation = 'operation', result?: T) {
    return (error: unknown): Observable<T> => {
      console.error(operation, error);
      return of(result as T);
    }
  }
}
