import { Component, OnInit } from '@angular/core';
import { ModalBaseComponent } from 'src/app/modal';

@Component({
  selector: 'app-alert-modal',
  templateUrl: './alert-modal.component.html',
  styleUrl: './alert-modal.component.scss'
})
export class AlertModalComponent extends ModalBaseComponent implements OnInit {
  message!: string;
  closeEvent!: any;

  constructor() { super()}


  override ngOnInit(): void {
    this.message = this.resources.get('message');
    this.closeEvent = this.resources.get('closeEvent');
  }

  closeModal(){
    this.modalCallback.emit(this.closeEvent);
  }
}
