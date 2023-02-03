import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { M5Page } from 'astros-common';
import { catchError, Observable, of, tap } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class RemotesService {

  private token: string

  constructor(private http: HttpClient) {
    this.token = '';
  }

  public getRemoteConfig(): Observable<string> {
    return this.http.get<string>(`/api/remoteConfig`, {
      headers: { Authorization: `Bearer ${this.getToken()}` }
    })
      .pipe(tap(_ => console.log(`loaded remote config`)),
        catchError(this.handleError<string>('getRemoteConfig'))
      );
  }


  public saveRemoteConfig(json: string): Observable<any> {
    return this.http.put<any>('/api/remoteConfig', {config: json}, {
      headers: { Authorization: `Bearer ${this.getToken()}` }
    })
      .pipe(
        tap(_ => console.log(`saveRemoteConfig result: ${_.message}`)),
        catchError(this.handleError<any>('saveRemoteConfig'))
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
