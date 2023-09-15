import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';

@Component({
  selector: 'app-cyborg',
  templateUrl: './cyborg.component.html',
  styleUrls: ['./cyborg.component.scss']
})
export class CyborgComponent {

  controller!: string;
  serialPort!: string;

  @Output("settingChangedCallback") modalCallback: EventEmitter<any> = new EventEmitter();

  constructor() { }

  controllerChange($event: any){
    this.modalCallback.emit({
      key: 'controller',
      value: $event
    });
  }

  serialChange($event: any){
    this.modalCallback.emit({
      key: 'serial',
      value: $event
    });
  }

}
