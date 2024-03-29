import { Component, OnInit } from '@angular/core';
import { ControllerType } from 'astros-common';
import { ModalBaseComponent } from 'src/app/modal';
import { ModalCallbackEvent } from 'src/app/shared/modal-resources';

@Component({
  selector: 'app-format-modal',
  templateUrl: './format-modal.component.html',
  styleUrls: ['./format-modal.component.scss']
})
export class FormatModalComponent extends ModalBaseComponent implements OnInit {

  core: boolean = false;
  dome: boolean = false;
  body: boolean = false;

  constructor() {
    super();
   }

  override ngOnInit(): void {
  }

  ok(){

    const result = new Array<number>();

    if (this.core){
      result.push(ControllerType.core);
    }
    if (this.dome){
      result.push(ControllerType.dome);
    }
    if (this.body){
      result.push(ControllerType.body);
    }

    this.modalCallback.emit({
      id: ModalCallbackEvent.formatSD,
      val: result
    })
  }

  closeModal(){
    this.modalCallback.emit({id: ModalCallbackEvent.close});
  }
}
