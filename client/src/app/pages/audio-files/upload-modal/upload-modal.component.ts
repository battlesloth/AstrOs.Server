import { Component, OnInit } from '@angular/core';
import { ModalBaseComponent } from 'src/app/modal';

@Component({
  selector: 'app-upload-modal',
  templateUrl: './upload-modal.component.html',
  styleUrls: ['./upload-modal.component.scss']
})
export class UploadModalComponent extends ModalBaseComponent implements OnInit {

  constructor() { 
    super();
  }

  override ngOnInit(): void {
  }

}
