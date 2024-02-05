import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';
import { ChannelType, ControlModule, AstrOsModuleCollection } from 'astros-common';


@Injectable({
  providedIn: 'root'
})
export class ControllerService {

  private token: string;

  constructor(private http: HttpClient) {
    this.token = '';
  }

  public getControllers(): Observable<AstrOsModuleCollection> {

    return this.http.get<AstrOsModuleCollection>('/api/controllers', {
      headers: { Authorization: `Bearer ${this.getToken()}` }
    })
      .pipe(tap(_ => console.log('loaded modules')),
        catchError(this.handleError<AstrOsModuleCollection>('getControllers'))
      );
  }

  public saveControllers(controllers: AstrOsModuleCollection): Observable<any> {
    return this.http.put<any>('/api/controllers', controllers, {
      headers: { Authorization: `Bearer ${this.getToken()}` }
    })
      .pipe(
        tap(_ => console.log(`saveControllers result: ${_.message}`)),
        catchError(this.handleError<any>('saveControllers'))
      );
  }

  public syncControllers(): Observable<any> {
    return this.http.get<any>('/api/controllers/sync', {
      headers: { Authorization: `Bearer ${this.getToken()}` }
    })
      .pipe(
        tap(_ => console.log(`syncControllers result: ${_.message}`)),
        catchError(this.handleError<any>('saveControllers'))
      );
  }

  sendControllerCommand(controllerId: number, channelType: ChannelType, command: any): Observable<any> {
    return this.http.post<any>('/api/directcommand', { controller: controllerId, commandType: channelType, command: command },
      {
        headers: { Authorization: `Bearer ${this.getToken()}` }
      })
      .pipe(
        tap(_ => console.log(`saveControllers result: ${_.message}`)),
        catchError(this.handleError<any>('saveControllers'))
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
