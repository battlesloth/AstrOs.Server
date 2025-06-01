import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface UserDetails {
  _id: string;
  username: string;
  exp: number;
  iat: number;
}

export interface TokenResponse {
  token: string;
}

export interface TokenPayload {
  username: string;
  password: string;
}

@Injectable({
  providedIn: 'root',
})
export class AuthenticationService {
  private token: string;

  constructor(
    private http: HttpClient,
    private router: Router,
  ) {
    this.token = '';
  }

  public login(user: TokenPayload): Observable<unknown> {
    return this.request('post', 'login', user);
  }

  public profile(): Observable<unknown> {
    return this.request('get', 'profile');
  }

  public logout(): void {
    this.token = '';
    window.localStorage.removeItem('astros-token');
    this.router.navigateByUrl('/');
  }

  public getUserDetails(): UserDetails | null {
    const token = this.getToken();
    let payload;
    if (token) {
      payload = token.split('.')[1];
      payload = window.atob(payload);
      return JSON.parse(payload);
    } else {
      return null;
    }
  }

  public isLoggedIn(): boolean {
    const user = this.getUserDetails();
    if (user) {
      return user.exp > Date.now() / 1000;
    } else {
      return false;
    }
  }

  private saveToken(token: string): void {
    localStorage.setItem('astros-token', token);
  }

  private getToken(): string {
    this.token = localStorage.getItem('astros-token') || '';

    return this.token;
  }

  private request(
    method: 'post' | 'get',
    type: 'login' | 'register' | 'profile',
    user?: TokenPayload,
  ): Observable<unknown> {
    let base$;

    if (method === 'post') {
      base$ = this.http.post(`/api/${type}`, user);
    } else {
      base$ = this.http.get(`/api/${type}`, {
        headers: { Authorization: `Bearer ${this.getToken()}` },
      });
    }

    const request = base$.pipe(
      map((data: unknown) => {
        if (data && typeof data === 'object' && 'token' in data)
          if (data.token) {
            this.saveToken(data.token as string);
          }
        return data;
      }),
    );

    return request;
  }
}
