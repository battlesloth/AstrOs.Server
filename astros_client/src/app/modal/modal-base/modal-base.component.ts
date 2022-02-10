import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';

@Component({
  selector: 'app-modal-base',
  template: '',
  styleUrls: ['./modal-base.component.scss']
})
export abstract class ModalBaseComponent implements OnInit {

  @Input()
  resources!: Map<string, any>;

  @Output("modalCallback") modalCallback: EventEmitter<any> = new EventEmitter();



  ngOnInit(): void {
  }

}
