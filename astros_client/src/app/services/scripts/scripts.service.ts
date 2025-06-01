import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { catchError, Observable, of, tap } from 'rxjs';
import { Script } from 'astros-common';

@Injectable({
  providedIn: 'root',
})
export class ScriptsService {
  private token: string;

  constructor(private http: HttpClient) {
    this.token = '';
  }

  public getAllScripts(): Observable<Script[]> {
    return this.http
      .get<Script[]>(`/api/scripts/all`, {
        headers: { Authorization: `Bearer ${this.getToken()}` },
      })
      .pipe(
        tap((_) => console.log(`loaded scripts`)),
        catchError(this.handleError<Script[]>('getAllScript')),
      );
  }

  public getScript(id: string): Observable<Script> {
    return this.http
      .get<Script>(`/api/scripts?id=${id}`, {
        headers: { Authorization: `Bearer ${this.getToken()}` },
      })
      .pipe(
        tap((_) => console.log(`loaded script ${id}`)),
        catchError(this.handleError<Script>('getScript')),
      );
  }

  public copyScript(id: string): Observable<Script> {
    return this.http
      .get<Script>(`/api/scripts/copy?id=${id}`, {
        headers: { Authorization: `Bearer ${this.getToken()}` },
      })
      .pipe(
        tap((_) => console.log(`loaded script ${id}`)),
        catchError(this.handleError<Script>('copyScript')),
      );
  }

  public saveScript(script: Script): Observable<unknown> {
    return this.http
      .put<unknown>('/api/scripts', script, {
        headers: { Authorization: `Bearer ${this.getToken()}` },
      })
      .pipe(
        tap((val) => {
          if (val && typeof val === 'object' && 'message' in val)
            console.log(`saveScript result: ${val.message}`);
        }),
        catchError(this.handleError<unknown>('saveScript')),
      );
  }

  public deleteScript(id: string): Observable<unknown> {
    return this.http
      .delete<unknown>(`/api/scripts?id=${id}`, {
        headers: { Authorization: `Bearer ${this.getToken()}` },
      })
      .pipe(
        tap((val) => {
          if (val && typeof val === 'object' && 'message' in val)
            console.log(`deleteScript result: ${val.message}`);
        }),
        catchError(this.handleError<unknown>('deleteScript')),
      );
  }

  public uploadScript(id: string): Observable<unknown> {
    return this.http
      .get<unknown>(`/api/scripts/upload?id=${id}`, {
        headers: { Authorization: `Bearer ${this.getToken()}` },
      })
      .pipe(
        tap((val) => {
          if (val && typeof val === 'object' && 'message' in val)
            console.log(`uploadScript result: ${val.message}`);
        }),
      );
  }

  public runScript(id: string): Observable<unknown> {
    return this.http
      .get<unknown>(`/api/scripts/run?id=${id}`, {
        headers: { Authorization: `Bearer ${this.getToken()}` },
      })
      .pipe(
        tap((val) => {
          if (val && typeof val === 'object' && 'message' in val)
            console.log(`runScript result: ${val.message}`);
        }),
        catchError(this.handleError<unknown>('runScript')),
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
