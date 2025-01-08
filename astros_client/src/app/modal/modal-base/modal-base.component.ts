import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';

@Component({
  selector: 'app-modal-base',
  template: '',
  styleUrls: ['./modal-base.component.scss']
})
export abstract class ModalBaseComponent implements OnInit {

  @Input()
  resources!: Map<string, any>;

  @Output() modalCallback = new EventEmitter<any>();



  ngOnInit(): void {
  }

}
