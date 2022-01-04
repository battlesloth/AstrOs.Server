import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { catchError, Observable, of, tap } from 'rxjs';
import { AudioFile } from 'src/app/models/audio-file';

@Injectable({
  providedIn: 'root'
})
export class AudioService {

  private token: string

  constructor(private http: HttpClient) {
    this.token = '';
  }

  public getAudioFiles(): Observable<any> {
    return this.http.get<AudioFile[]>(`/api/audio/all`, {
      headers: { Authorization: `Bearer ${this.getToken()}` }
    })
      .pipe(tap(_ => console.log(`loaded audio files`)),
        catchError(this.handleError<AudioFile[]>('getAudioFiles'))
      );
  }

  private getToken(): string {
    if (!this.token) {
      this.token = localStorage.getItem('astros-token') || '';
    }
    return this.token;
  }

  private handleError<T>(operation = 'operation', result?: T) {
    return (error: any): Observable<T> => {
      console.error(error);
      return of(result as T);
    }
  }
}
