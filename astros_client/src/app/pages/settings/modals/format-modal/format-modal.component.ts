import { Component, OnInit } from '@angular/core';
import { ModalBaseComponent } from 'src/app/modal';
import { ModalCallbackEvent, ModalResources } from 'src/app/shared/modal-resources';
import { NgFor } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
    selector: 'app-format-modal',
    templateUrl: './format-modal.component.html',
    styleUrls: ['./format-modal.component.scss'],
    standalone: true,
    imports: [NgFor, FormsModule]
})
export class FormatModalComponent extends ModalBaseComponent implements OnInit {

  controllers: any[] = [];

  constructor() {
    super();
  }

  override ngOnInit(): void {
    if (this.resources.has(ModalResources.controllers)) {
      for (const controller of this.resources.get(ModalResources.controllers)) {
        this.controllers.push(
          {
            id: controller.id, name: controller.name, address: controller.address, selected: false
          });
      }
    }
  }

  ok() {

    const result = new Array<any>();

    for (const controller of this.controllers) {
      if (controller.selected) {
        result.push({ name: controller.name, address: controller.address });
      }
    }

    this.modalCallback.emit({
      id: ModalCallbackEvent.formatSD,
      val: result
    })
  }

  closeModal() {
    this.modalCallback.emit({ id: ModalCallbackEvent.close });
  }
}
