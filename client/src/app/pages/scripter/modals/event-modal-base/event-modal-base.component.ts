import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';

@Component({
  selector: 'app-event-modal-base',
  template: '',
  styleUrls: ['./event-modal-base.component.scss']
})
export class EventModalBaseComponent implements OnInit {

  @Input()
  resources!: Map<string, any>;

  @Output("modalCallback") timelineCallback: EventEmitter<any> = new EventEmitter();

  constructor() { }

  ngOnInit(): void {
  }

}
