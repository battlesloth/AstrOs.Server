import { Component, OnInit } from '@angular/core';
import { ModalBaseComponent } from '../../../../modal/modal-base/modal-base.component';

@Component({
  selector: 'app-pwm-event-modal',
  templateUrl: './pwm-event-modal.component.html',
  styleUrls: ['./pwm-event-modal.component.scss']
})
export class PwmEventModalComponent extends ModalBaseComponent implements OnInit {

  constructor() {
    super();
  }

  override ngOnInit(): void {
  }

}
