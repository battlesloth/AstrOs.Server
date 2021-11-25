import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

@Injectable({
  providedIn: 'root'
})
export class ModulesService {

  private token: string;

  constructor(private http: HttpClient) {
    this.token = '';
   }

   public getModules(): Observable<any> {
     let base$;

      base$ = this.http.get('/api/modules', {
        headers: {Authorization: `Bearer ${this.getToken()}`}
      });

      const request = base$.pipe(
        map((data: any) =>{
          return data;
        })
      );

      return request;
   }

   private getToken(): string {
    if (!this.token){
      this.token = localStorage.getItem("astros-token") || '';
    }
    return this.token;
  }
}
