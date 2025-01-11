import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
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


  public saveRemoteConfig(json: string): Observable<unknown> {
    return this.http.put<unknown>('/api/remoteConfig', { config: json }, {
      headers: { Authorization: `Bearer ${this.getToken()}` }
    })
      .pipe(
        tap(val => {
          if (val && typeof val === 'object' && 'message' in val)
            console.log(`saveRemoteConfig result: ${val.message}`)
        }),
        catchError(this.handleError<unknown>('saveRemoteConfig'))
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
