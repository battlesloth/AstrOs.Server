import { Injectable } from "@angular/core";
import {  ChannelType } from "astros-common";
import { Observable, of } from "rxjs";

@Injectable({
  providedIn: 'root',
})
export class ControllerServiceMock {
  
  public getLocations(): Observable<any> {
    return of(undefined);
  }

  public getLoadedLocations(): Observable<any> {
    return of(undefined);
  }

  public saveLocations(
    controllers: any,
): Observable<unknown> {
    return of(null);
  }

  public syncControllers(): Observable<unknown> {
    return of(null);
  }

  public syncLocationConfig(): Observable<unknown> {
    return of(null);
  }

  sendControllerCommand(
    controllerId: number,
    channelType: ChannelType,
    command: unknown,
  ): Observable<unknown> {
    return of(null);
  }
  
}