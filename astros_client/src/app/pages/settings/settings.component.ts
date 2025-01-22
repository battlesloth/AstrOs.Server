import { KeyValue } from '@angular/common';
import {
  Component,
  ComponentRef,
  OnInit,
  ViewChild,
  ViewContainerRef,
} from '@angular/core';
import {
  FormatModalComponent,
  FormatModalResources,
  ModalComponent,
} from '@src/components/modals';
import { ModalCallbackEvent } from '../../components/modals/modal-base/modal-callback-event';
import { ModalService, SettingsService, SnackbarService } from '@src/services';
import { ControlModule } from 'astros-common';

@Component({
  selector: 'app-settings',
  templateUrl: './settings.component.html',
  styleUrls: ['./settings.component.scss'],
  imports: [ModalComponent],
})
export class SettingsComponent implements OnInit {
  @ViewChild('modalContainer', { read: ViewContainerRef })
  container!: ViewContainerRef;

  apiKey = '';
  private characters =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

  private controllers: ControlModule[] = [];

  constructor(
    private settingsService: SettingsService,
    private snackBarService: SnackbarService,
    private modalService: ModalService,
  ) {}

  ngOnInit(): void {
    const apiObs = {
      next: (result: KeyValue<string, string>) => {
        this.apiKey = result.value;
      },
      error: (err: unknown) => console.error(err),
    };

    this.settingsService.getSetting('apikey').subscribe(apiObs);

    const ctrlObs = {
      next: (result: ControlModule[]) => {
        this.controllers = result;
      },
      error: (err: unknown) => console.error(err),
    };

    this.settingsService.getControllers().subscribe(ctrlObs);
  }

  generateApiKey() {
    let result = '';
    const charactersLength = this.characters.length;
    for (let i = 0; i < 10; i++) {
      result += this.characters.charAt(
        Math.floor(Math.random() * charactersLength),
      );
    }

    this.apiKey = result;

    const observer = {
      next: (_: unknown) => {
        console.log('API key saved');
      },
      error: (err: unknown) => {
        console.error(err);
        this.apiKey = 'Failed to save API key';
      },
    };

    this.settingsService
      .saveSetting({ key: 'apikey', value: result })
      .subscribe(observer);
  }

  modalCallback(evt: ModalCallbackEvent) {
    switch (evt.type) {
      case FormatModalResources.formatSdEvent:
        this.formatSD(evt.value as unknown[]);
        break;
    }

    this.modalService.close('scripts-modal');
    this.container.clear();
  }

  popModal(val: string) {
    this.container.clear();
    const modalResources = new Map<string, unknown>();

    let component: ComponentRef<FormatModalComponent>;

    switch (val) {
      case 'format':
        modalResources.set(FormatModalResources.controllers, this.controllers);
        component = this.container.createComponent(FormatModalComponent);
        break;
      default:
        return;
    }

    component.instance.resources = modalResources;
    component.instance.modalCallback.subscribe((evt: ModalCallbackEvent) => {
      this.modalCallback(evt);
    });

    this.modalService.open('scripts-modal');
  }

  formatSD(val: unknown[]) {
    const observer = {
      next: (_: unknown) => {
        this.snackBarService.okToast('Format queued!');
      },
      error: (err: unknown) => {
        this.snackBarService.okToast('Error requesting format. Check logs.');
        console.error(err);
      },
    };

    this.settingsService.formatSD(val).subscribe(observer);
  }
}
