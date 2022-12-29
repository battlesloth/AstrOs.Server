import { Component, OnInit } from '@angular/core';
import { BaseEventModalComponent } from '../base-event-modal/base-event-modal.component';

@Component({
  selector: 'app-script-test-modal',
  templateUrl: './script-test-modal.component.html',
  styleUrls: ['./script-test-modal.component.scss']
})
export class ScriptTestModalComponent  extends BaseEventModalComponent implements OnInit {

  constructor() {
    super();
  }

  override ngOnInit(): void {
  
  }
  
}
