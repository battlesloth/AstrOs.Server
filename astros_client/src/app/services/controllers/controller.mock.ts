import { Injectable } from "@angular/core";
import { AstrOsConstants, AstrOsLocationCollection, ControllerLocation } from "astros-common";
//mport {  ChannelType } from "astros-common";
import { Observable, of } from "rxjs";

@Injectable({
  providedIn: 'root',
})
export class ControllerServiceMock {
  
  public getLocations(): Observable<any> {
    return of(
      new AstrOsLocationCollection(
        new ControllerLocation(0, AstrOsConstants.CORE, 'Test Location', 'ESP', 'fingerprint'),
        new ControllerLocation(1, AstrOsConstants.DOME, 'Test Location 2', 'ESP', 'fingerprint'),
        new ControllerLocation(2, AstrOsConstants.BODY, 'Test Location 3', 'ESP', 'fingerprint'),
      )
    );
  }

  public getLoadedLocations(): Observable<any> {
    return of(
      new AstrOsLocationCollection(
        new ControllerLocation(0, AstrOsConstants.CORE, 'Test Location', 'ESP', 'fingerprint'),
        new ControllerLocation(1, AstrOsConstants.DOME, 'Test Location 2', 'ESP', 'fingerprint'),
        new ControllerLocation(2, AstrOsConstants.BODY, 'Test Location 3', 'ESP', 'fingerprint'),
      )
    );
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
    channelType: unknown,
    command: unknown,
  ): Observable<unknown> {
    return of(null);
  }
  
}