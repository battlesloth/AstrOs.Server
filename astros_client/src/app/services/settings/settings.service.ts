import { KeyValue } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { ControlModule } from 'astros-common';
import { Observable, tap, catchError, of } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class SettingsService {

  private token: string

  constructor(private http: HttpClient) {
    this.token = '';
  }

  public getSetting(key: string): Observable<KeyValue<string, string>> {
    return this.http.get<KeyValue<string, string>>(`/api/settings?key=${key}`, {
      headers: { Authorization: `Bearer ${this.getToken()}` }
    })
      .pipe(tap(_ => console.log(`got setting for ${key}`)),
        catchError(this.handleError<KeyValue<string, string>>('getSettings'))
      );
  }

  getControllers(): Observable<ControlModule[]> {
    return this.http.get<ControlModule[]>('/api/settings/controllers', {
      headers: { Authorization: `Bearer ${this.getToken()}` }
    })
      .pipe(tap(_ => console.log('got controllers')),
        catchError(this.handleError<ControlModule[]>('getControllers'))
      );
  }

  public saveSetting(setting: KeyValue<string, string>): Observable<any> {
    return this.http.put<any>('/api/settings', setting, {
      headers: { Authorization: `Bearer ${this.getToken()}` }
    })
      .pipe(
        tap(_ => console.log(`saveRemoteConfig result: ${_.message}`)),
        catchError(this.handleError<any>('saveRemoteConfig'))
      );
  }


  public formatSD(controllers: Array<any>): Observable<any> {
    return this.http.post<Array<any>>(`/api/settings/formatSD`, { controllers: controllers },
      {
        headers: { Authorization: `Bearer ${this.getToken()}` }
      })
      .pipe(tap(_ => console.log('SD Format Queued')),
        catchError(this.handleError<any>('formatSD'))
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
