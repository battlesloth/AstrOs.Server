import { Injectable } from "@angular/core";
import { ControllersResponse, ControlModule } from "astros-common";
import { Observable, of } from "rxjs";

export enum MockType {
    Default,
    ControllersResponseSuccess,
    ControllersResponseFailure,
}

@Injectable({
    providedIn: 'root',
})
export class WebsocketMock {
    
    public messages!: Observable<unknown>;

    constructor() {   
    }

    public connect(): void {
    }

    public disconnect(): void {
    }

    public send(): void {
    }   
}

@Injectable({
    providedIn: 'root',
})
export class WebsocketMockDefault
 extends WebsocketMock {
    constructor() {
        super();
        this.messages = of({});
    }
}

@Injectable({
    providedIn: 'root',
})
export class WebsocketMockControllersSuccess 
 extends WebsocketMock {
    
    constructor() {
        super();
        this.messages = of(
            new ControllersResponse(true, [
                new ControlModule(0, 'Test Controller 1', 'fingerprint'),
                new ControlModule(1, 'Test Controller 2', 'fingerprint'),
                new ControlModule(2, 'Test Controller 3', 'fingerprint'),
            ]
        ))
    }
}

@Injectable({
    providedIn: 'root'
})
export class WebsocketMockControllersFailure 
 extends WebsocketMockDefault {
    
    constructor() {
        super();
        this.messages = of( new ControllersResponse(false, []));
    }
}