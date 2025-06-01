import { KeyValue } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { ControlModule } from 'astros-common';
import { Observable, tap, catchError, of } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class SettingsService {
  private token: string;

  constructor(private http: HttpClient) {
    this.token = '';
  }

  public getSetting(key: string): Observable<KeyValue<string, string>> {
    return this.http
      .get<KeyValue<string, string>>(`/api/settings?key=${key}`, {
        headers: { Authorization: `Bearer ${this.getToken()}` },
      })
      .pipe(
        tap((_) => console.log(`got setting for ${key}`)),
        catchError(this.handleError<KeyValue<string, string>>('getSettings')),
      );
  }

  getControllers(): Observable<ControlModule[]> {
    return this.http
      .get<ControlModule[]>('/api/settings/controllers', {
        headers: { Authorization: `Bearer ${this.getToken()}` },
      })
      .pipe(
        tap((_) => console.log('got controllers')),
        catchError(this.handleError<ControlModule[]>('getControllers')),
      );
  }

  public saveSetting(setting: KeyValue<string, string>): Observable<unknown> {
    return this.http
      .put<unknown>('/api/settings', setting, {
        headers: { Authorization: `Bearer ${this.getToken()}` },
      })
      .pipe(
        tap((val) => {
          if (val && typeof val === 'object' && 'message' in val)
            console.log(`saveRemoteConfig result: ${val.message}`);
        }),
        catchError(this.handleError<unknown>('saveRemoteConfig')),
      );
  }

  public formatSD(controllers: unknown[]): Observable<unknown> {
    return this.http
      .post<unknown[]>(
        `/api/settings/formatSD`,
        { controllers: controllers },
        {
          headers: { Authorization: `Bearer ${this.getToken()}` },
        },
      )
      .pipe(
        tap((_) => console.log('SD Format Queued')),
        catchError(this.handleError<unknown>('formatSD')),
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
    };
  }
}
