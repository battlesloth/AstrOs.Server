import { Injectable } from "@angular/core";

@Injectable()
export class ActivatedRouteMock {
    public snapshot = {
        paramMap: new Map([["id", "1"]]),
    };
}