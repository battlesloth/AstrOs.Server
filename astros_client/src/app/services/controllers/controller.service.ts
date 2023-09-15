import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';
import { ChannelType, ControllerType, ControlModule, ModuleCollection } from 'astros-common';


@Injectable({
  providedIn: 'root'
})
export class ControllerService  {

  private token: string;

  constructor(private http: HttpClient) {
    this.token = '';
   }

   public getControllers(): Observable<ModuleCollection> {
     
      return this.http.get<ModuleCollection>('/api/controllers', {
        headers: {Authorization: `Bearer ${this.getToken()}`}
      })
      .pipe( tap(_ => console.log('loaded modules')),
        catchError(this.handleError<ModuleCollection>('getControllers'))
      );
   }

  public saveControllers(controllers: ModuleCollection) : Observable<any> {
      return this.http.put<any>('/api/controllers', controllers, {
        headers: {Authorization: `Bearer ${this.getToken()}`}
      })
      .pipe(
        tap(_ => console.log(`saveControllers result: ${_.message}`)),
        catchError(this.handleError<any>('saveControllers'))
      );
  }

  public syncControllers() : Observable<any> {
    return this.http.get<any>('/api/controllers/sync', {
      headers: {Authorization: `Bearer ${this.getToken()}`}
    })
    .pipe(
      tap(_ => console.log(`syncControllers result: ${_.message}`)),
      catchError(this.handleError<any>('saveControllers'))
    );
  }

  sendControllerCommand(controller: ControllerType, channelType: ChannelType, command: any) : Observable<any> {
    return this.http.post<any>('/api/directcommand', {controller: controller, commandType: channelType, command: command},
     {
      headers: {Authorization: `Bearer ${this.getToken()}`}
    })
    .pipe(
      tap(_ => console.log(`saveControllers result: ${_.message}`)),
      catchError(this.handleError<any>('saveControllers'))
    );
   }
  
  private getToken(): string {
    if (!this.token){
      this.token = localStorage.getItem('astros-token') || '';
    }
    return this.token;
  }

  private handleError<T>(operation = 'operation', result?: T) {
    return (error: any): Observable<T> =>{
      console.error(error);

      return of(result as T);
    }
  }
}
