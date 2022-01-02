import { Component, OnInit } from '@angular/core';
import { EventModalBaseComponent } from '../event-modal-base/event-modal-base.component';

@Component({
  selector: 'app-i2c-event-modal',
  templateUrl: './i2c-event-modal.component.html',
  styleUrls: ['./i2c-event-modal.component.scss']
})
export class I2cEventModalComponent extends EventModalBaseComponent implements OnInit {

  constructor() {
    super();
  }

  override ngOnInit(): void {
  }

}
