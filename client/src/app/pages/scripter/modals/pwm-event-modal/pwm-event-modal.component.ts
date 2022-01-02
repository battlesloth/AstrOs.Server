import { Component, OnInit } from '@angular/core';
import { EventModalBaseComponent } from '../event-modal-base/event-modal-base.component';

@Component({
  selector: 'app-pwm-event-modal',
  templateUrl: './pwm-event-modal.component.html',
  styleUrls: ['./pwm-event-modal.component.scss']
})
export class PwmEventModalComponent extends EventModalBaseComponent implements OnInit {

  constructor() {
    super();
  }

  override ngOnInit(): void {
  }

}
