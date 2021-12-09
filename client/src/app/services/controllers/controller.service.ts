import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { catchError, map, tap } from 'rxjs/operators';
import {ControlModule} from "../../models/control-module";

@Injectable({
  providedIn: 'root'
})
export class ControllerService  {
  

  private token: string;

  constructor(private http: HttpClient) {
    this.token = '';
   }

   public getControllers(): Observable<ControlModule[]> {
     
      return this.http.get<ControlModule[]>('/api/controllers', {
        headers: {Authorization: `Bearer ${this.getToken()}`}
      })
      .pipe( tap(_ => console.log('loaded controllers')),
        catchError(this.handleError<ControlModule[]>('get', []))
      );
   }

  public saveControllers(controllers: ControlModule[]) : Observable<any> {
      return this.http.put<any>('/api/controllers', controllers, {
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
