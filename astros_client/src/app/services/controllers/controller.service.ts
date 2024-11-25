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

  public saveLocations(controllers: AstrOsLocationCollection): Observable<any> {
    return this.http.put<any>('/api/locations', controllers, {
      headers: { Authorization: `Bearer ${this.getToken()}` }
    })
      .pipe(
        tap(_ => console.log(`saveLocations result: ${_.message}`)),
        catchError(this.handleError<any>('saveLocations'))
      );
  }

  public syncControllers(): Observable<any> {
    return this.http.get<any>('/api/locations/synccontrollers', {
      headers: { Authorization: `Bearer ${this.getToken()}` }
    })
      .pipe(
        tap(_ => console.log(`syncControllers result: ${_.message}`)),
        catchError(this.handleError<any>('syncLocations'))
      );
  }

  public syncLocationConfig(): Observable<any> {
    return this.http.get<any>('/api/locations/syncconfig', {
      headers: { Authorization: `Bearer ${this.getToken()}` }
    })
      .pipe(
        tap(_ => console.log(`syncLocationConfig result: ${_.message}`)),
        catchError(this.handleError<any>('syncLocations'))
      );
  }

  sendControllerCommand(controllerId: number, channelType: ChannelType, command: any): Observable<any> {
    return this.http.post<any>('/api/directcommand', { controller: controllerId, commandType: channelType, command: command },
      {
        headers: { Authorization: `Bearer ${this.getToken()}` }
      })
      .pipe(
        tap(_ => console.log(`direct command result: ${_.message}`)),
        catchError(this.handleError<any>('sendControllerCommand'))
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
