import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { catchError, Observable, of, tap } from 'rxjs';
import { Script } from 'src/app/models/scripts/script';
import { ScriptEvent } from 'src/app/models/scripts/script_event';

@Injectable({
  providedIn: 'root'
})
export class ScriptsService {

  private token: string

  constructor(private http: HttpClient) {
    this.token = '';
  }

  public getAllScripts(): Observable<any> {
    return this.http.get<Script[]>(`/api/scripts/all`, {
      headers: { Authorization: `Bearer ${this.getToken()}` }
    })
      .pipe(tap(_ => console.log(`loaded scripts`)),
        catchError(this.handleError<Script[]>('getAllScript'))
      );
  }

  public getScript(id: string): Observable<Script> {
    return this.http.get<Script>(`/api/scripts?id=${id}`, {
      headers: { Authorization: `Bearer ${this.getToken()}` }
    })
      .pipe(tap(_ => console.log(`loaded script ${id}`)),
        catchError(this.handleError<Script>('getScript'))
      );
  }

  public saveScript(script: Script): Observable<any> {
    return this.http.put<any>('/api/scripts', script, {
      headers: { Authorization: `Bearer ${this.getToken()}` }
    })
      .pipe(
        tap(_ => console.log(`saveScript result: ${_.message}`)),
        catchError(this.handleError<any>('saveScript'))
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
