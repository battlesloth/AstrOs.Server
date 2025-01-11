import { Component, EventEmitter, Input, Output } from '@angular/core';
import { ModalCallbackEvent } from './modal-callback-event';

@Component({
  selector: 'app-modal-base',
  template: '',
  styleUrls: ['./modal-base.component.scss'],
})
export abstract class ModalBaseComponent {

  @Input()
  resources!: Map<string, unknown>;

  @Output() modalCallback = new EventEmitter<ModalCallbackEvent>();
}


