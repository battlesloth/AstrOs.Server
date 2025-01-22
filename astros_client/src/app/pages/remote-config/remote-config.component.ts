import { Component, ViewChild } from '@angular/core';
import { M5Page, PageButton } from 'astros-common';
import { RemotesService } from 'src/app/services/remotes/remotes.service';
import { SnackbarService } from 'src/app/services/snackbar/snackbar.service';
import { M5PaperConfigComponent } from './m5-paper-config/m5-paper-config.component';

@Component({
    selector: 'app-remote-config',
    templateUrl: './remote-config.component.html',
    styleUrls: ['./remote-config.component.scss'],
    imports: [M5PaperConfigComponent]
})
export class RemoteConfigComponent {
  @ViewChild('config') config!: M5PaperConfigComponent;

  remoteName = 'Astr-Os Screen';

  constructor(
    private remoteService: RemotesService,
    private snackBar: SnackbarService,
  ) {}

  saveConfig() {
    const observer = {
      next: (result: unknown) => {
        if (result && typeof result === 'object' && 'message' in result) {
          if (result.message === 'success') {
            console.log('Config saved!');
            this.snackBar.okToast('Config saved!');
          } else {
            console.log('Config save failed!');
            this.snackBar.okToast('Script settings save failed!');
          }
        }
      },
      error: (err: unknown) => {
        console.error(err);
        this.snackBar.okToast('Config save failed!');
      },
    };

    const config = new Array<M5Page>();
    this.config.m5Config.forEach((page) => {
      if (this.hasSettings(page)) {
        config.push(page);
      }
    });

    this.remoteService
      .saveRemoteConfig(JSON.stringify(config))
      .subscribe(observer);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  hasSettings(page: any): boolean {
    for (const key in page) {
      if (Object.prototype.hasOwnProperty.call(page, key)) {
        const element = page[key] as unknown as PageButton;
        if (element.id != '0') {
          return true;
        }
      }
    }
    return false;
  }
}
