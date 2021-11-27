import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { catchError, map, tap } from 'rxjs/operators';
import {ControlModule} from "../../models/control-module";

@Injectable({
  providedIn: 'root'
})
export class ModulesService  {
  

  private token: string;

  constructor(private http: HttpClient) {
    this.token = '';
   }

   public getModules(): Observable<ControlModule[]> {
     
      return this.http.get<ControlModule[]>('/api/modules', {
        headers: {Authorization: `Bearer ${this.getToken()}`}
      })
      .pipe( tap(_ => console.log('loaded modules')),
        catchError(this.handleError<ControlModule[]>('getModules', []))
      );
   }

  public saveModules(modules: ControlModule[]) : Observable<any> {
      return this.http.put<any>('/api/modules', modules, {
        headers: {Authorization: `Bearer ${this.getToken()}`}
      })
      .pipe(
        tap(_ => console.log(`saveModule result: ${_.message}`)),
        catchError(this.handleError<any>('saveModules'))
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
