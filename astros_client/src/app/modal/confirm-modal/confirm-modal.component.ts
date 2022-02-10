import { Component, OnInit } from '@angular/core';
import { ModalBaseComponent } from 'src/app/modal';

@Component({
  selector: 'astros-confirm-modal',
  templateUrl: './confirm-modal.component.html',
  styleUrls: ['./confirm-modal.component.scss']
})
export class ConfirmModalComponent extends ModalBaseComponent implements OnInit {

  action!: string;
  message!: string;
  confirmEvent!: any; 
  closeEvent!: any;

  constructor() { super()}


  override ngOnInit(): void {
    this.action = this.resources.get('action');
    this.message = this.resources.get('message');
    this.confirmEvent = this.resources.get('confirmEvent');
    this.closeEvent = this.resources.get('closeEvent');
  }

  confirm(){
    this.modalCallback.emit(this.confirmEvent);
  }

  closeModal(){
    this.modalCallback.emit(this.closeEvent);
  }
}
