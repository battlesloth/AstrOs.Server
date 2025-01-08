import { KeyValue } from '@angular/common';
import { Component, OnInit, ViewChild, ViewContainerRef } from '@angular/core';
import { ModalService } from 'src/app/modal';
import { SettingsService } from 'src/app/services/settings/settings.service';
import { SnackbarService } from 'src/app/services/snackbar/snackbar.service';
import { ModalCallbackEvent, ModalResources } from 'src/app/shared/modal-resources';
import { FormatModalComponent } from './modals/format-modal/format-modal.component';
import { ControlModule } from 'astros-common';
import { ModalComponent } from '../../modal/modal.component';

@Component({
    selector: 'app-settings',
    templateUrl: './settings.component.html',
    styleUrls: ['./settings.component.scss'],
    standalone: true,
    imports: [ModalComponent]
})
export class SettingsComponent implements OnInit {
  @ViewChild('modalContainer', { read: ViewContainerRef }) container!: ViewContainerRef;

  apiKey = "";
  private characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

  private controllers: ControlModule[] = [];

  constructor(private settingsService: SettingsService,
    private snackBarService: SnackbarService,
    private modalService: ModalService) { }

  ngOnInit(): void {
    const apiObs = {
      next: (result: KeyValue<string, string>) => {
        this.apiKey = result.value;
      },
      error: (err: any) => console.error(err)
    };

    this.settingsService.getSetting('apikey').subscribe(apiObs);

    const ctrlObs = {
      next: (result: any) => {
        this.controllers = result;
      },
      error: (err: any) => console.error(err)
    };

    this.settingsService.getControllers().subscribe(ctrlObs);

  }

  generateApiKey() {
    let result = '';
    const charactersLength = this.characters.length;
    for (let i = 0; i < 10; i++) {
      result += this.characters.charAt(Math.floor(Math.random() * charactersLength));
    }

    this.apiKey = result;

    const observer = {
      next: (result: KeyValue<string, string>) => {

      },
      error: (err: any) => {
        console.error(err)
        this.apiKey = "Failed to save API key"
      }
    };

    this.settingsService.saveSetting({ key: 'apikey', value: result }).subscribe(observer);
  }

  modalCallback(evt: any) {

    switch (evt.id) {
      case ModalCallbackEvent.formatSD:
        this.formatSD(evt.val);
        break;
    }

    this.modalService.close('scripts-modal');
    this.container.clear();
  }

  popModal(val: string) {
    this.container.clear();
    const modalResources = new Map<string, any>();

    let component: any;

    switch (val) {
      case 'format':
        modalResources.set(ModalResources.controllers, this.controllers);
        component = this.container.createComponent(FormatModalComponent);
        break;
      default:
        return;
    }

    component.instance.resources = modalResources;
    component.instance.modalCallback.subscribe((evt: any) => {
      this.modalCallback(evt);
    });

    this.modalService.open('scripts-modal');
  }

  formatSD(val: any[]) {
    const observer = {
      next: (result: any) => {
        this.snackBarService.okToast('Format queued!');
      },
      error: (err: any) => {
        this.snackBarService.okToast('Error requesting format. Check logs.');
        console.error(err);
      }
    };

    this.settingsService.formatSD(val).subscribe(observer);
  }

}
