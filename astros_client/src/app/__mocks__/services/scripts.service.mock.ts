import { Injectable } from "@angular/core";
import { Script } from "astros-common";
import { Observable, of } from "rxjs";

@Injectable({
  providedIn: 'root',
})
export class ScriptsServiceMock {

  public getAllScripts(): Observable<Script[]> {
    return of([]);
  }

  public getScript(id: string): Observable<Script> {
    return of(new Script("","","", new Date()));
  }

  public copyScript(id: string): Observable<Script> {
    return of(new Script("","","", new Date()));
  }

  public saveScript(script: Script): Observable<unknown> {
    return of()
}

  public deleteScript(id: string): Observable<unknown> {
    return of();
  }

  public uploadScript(id: string): Observable<unknown> {
    return of();
  }

  public runScript(id: string): Observable<unknown> {
    return of();
  }
}
