import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';
import { ChannelType, AstrOsLocationCollection } from 'astros-common';


@Injectable({
  providedIn: 'root'
})
export class ControllerService {

  private token: string;

  constructor(private http: HttpClient) {
    this.token = '';
  }

  public getLocations(): Observable<AstrOsLocationCollection> {

    return this.http.get<AstrOsLocationCollection>('/api/locations', {
      headers: { Authorization: `Bearer ${this.getToken()}` }
    })
      .pipe(tap(_ => console.log('got locations')),
        catchError(this.handleError<AstrOsLocationCollection>('getLocations'))
      );
  }

  public getLoadedLocations(): Observable<AstrOsLocationCollection> {

    return this.http.get<AstrOsLocationCollection>('/api/locations/load', {
      headers: { Authorization: `Bearer ${this.getToken()}` }
    })
      .pipe(tap(_ => console.log('loaded locations')),
        catchError(this.handleError<AstrOsLocationCollection>('getLocations'))
      );
  }

  public saveLocations(controllers: AstrOsLocationCollection): Observable<unknown> {
    return this.http.put<unknown>('/api/locations', controllers, {
      headers: { Authorization: `Bearer ${this.getToken()}` }
    })
      .pipe(
        tap(val => {
          if (val && typeof val === 'object' && 'message' in val)
            console.log(`saveLocations result: ${val.message}`)
        }),
        catchError(this.handleError<unknown>('saveLocations'))
      );
  }

  public syncControllers(): Observable<unknown> {
    return this.http.get<unknown>('/api/locations/synccontrollers', {
      headers: { Authorization: `Bearer ${this.getToken()}` }
    })
      .pipe(
        tap(val => {
          if (val && typeof val === 'object' && 'message' in val)
            console.log(`syncControllers result: ${val.message}`)
        }),
        catchError(this.handleError<unknown>('syncLocations'))
      );
  }

  public syncLocationConfig(): Observable<unknown> {
    return this.http.get<unknown>('/api/locations/syncconfig', {
      headers: { Authorization: `Bearer ${this.getToken()}` }
    })
      .pipe(
        tap(val => {
          if (val && typeof val === 'object' && 'message' in val)
            console.log(`syncLocationConfig result: ${val.message}`)
        }),
        catchError(this.handleError<unknown>('syncLocations'))
      );
  }

  sendControllerCommand(controllerId: number, channelType: ChannelType, command: unknown): Observable<unknown> {
    return this.http.post<unknown>('/api/directcommand', { controller: controllerId, commandType: channelType, command: command },
      {
        headers: { Authorization: `Bearer ${this.getToken()}` }
      })
      .pipe(
        tap(val => {
          if (val && typeof val === 'object' && 'message' in val)
            console.log(`direct command result: ${val.message}`)
        }),
        catchError(this.handleError<unknown>('sendControllerCommand'))
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
