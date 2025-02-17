import { Injectable } from "@angular/core";
import { AstrOsConstants, AstrOsLocationCollection, ControllerLocation, GpioChannel, GpioModule } from "astros-common";
//mport {  ChannelType } from "astros-common";
import { Observable, of } from "rxjs";

@Injectable({
  providedIn: 'root',
})
export class ControllerServiceMock {

  public getLocations(): Observable<any> {
    return of(
      this.generateLocationCollection()
    );
  }

  public getLoadedLocations(): Observable<any> {
    return of(
      this.generateLocationCollection()
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


  generateLocationCollection() {
    const locations = new AstrOsLocationCollection(
      new ControllerLocation('1234', AstrOsConstants.CORE, 'Test Location', 'fingerprint'),
      new ControllerLocation('5678', AstrOsConstants.DOME, 'Test Location 2', 'fingerprint'),
      new ControllerLocation('9010', AstrOsConstants.BODY, 'Test Location 3', 'fingerprint'),
    );

    locations.bodyModule!.gpioModule = this.generateGpioModule();
    locations.domeModule!.gpioModule = this.generateGpioModule();
    locations.coreModule!.gpioModule = this.generateGpioModule();

    return locations;
  }

  generateGpioModule() {
    const module = new GpioModule('1234');

    for (let i = 0; i < 10; i++) {
      module.channels.push(new GpioChannel(`1234${i}`, module.id, i, false, `Channel ${i}`, false));
    }
    return module;
  }
}