import { Component, OnInit } from '@angular/core';
import { ModalBaseComponent } from '../../modal-base/modal-base.component';
import { ModalCallbackEvent } from '../../modal-base/modal-callback-event';

import { FormsModule } from '@angular/forms';

interface ResourceController {
  id: number;
  name: string;
  address: string;
}

interface Controller {
  id: number;
  name: string;
  address: string;
  selected: boolean;
}

export class FormatModalResources {
  public static controllers = 'controllers';

  public static formatSdEvent = 'format_formatSD';
  public static closeEvent = 'format_close';
}

@Component({
  selector: 'app-format-modal',
  templateUrl: './format-modal.component.html',
  styleUrls: ['./format-modal.component.scss'],
  imports: [FormsModule],
})
export class FormatModalComponent extends ModalBaseComponent implements OnInit {
  controllers: Controller[] = [];

  constructor() {
    super();
  }

  ngOnInit(): void {
    if (this.resources.has(FormatModalResources.controllers)) {
      for (const controller of this.resources.get(
        FormatModalResources.controllers,
      ) as ResourceController[]) {
        this.controllers.push({
          id: controller.id,
          name: controller.name,
          address: controller.address,
          selected: false,
        });
      }
    }
  }

  ok() {
    const result = [];

    for (const controller of this.controllers) {
      if (controller.selected) {
        result.push({ name: controller.name, address: controller.address });
      }
    }

    const evt = new ModalCallbackEvent(
      FormatModalResources.formatSdEvent,
      result,
    );
    this.modalCallback.emit(evt);
  }

  closeModal() {
    const evt = new ModalCallbackEvent(FormatModalResources.closeEvent, null);
    this.modalCallback.emit(evt);
  }
}
