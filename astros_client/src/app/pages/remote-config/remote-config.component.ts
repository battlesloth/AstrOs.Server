import { Component, OnInit, ViewChild } from '@angular/core';
import { RemotesService } from 'src/app/services/remotes/remotes.service';
import { SnackbarService } from 'src/app/services/snackbar/snackbar.service';
import { M5PaperConfigComponent } from './m5-paper-config/m5-paper-config.component';

@Component({
  selector: 'app-remote-config',
  templateUrl: './remote-config.component.html',
  styleUrls: ['./remote-config.component.scss']
})
export class RemoteConfigComponent implements OnInit {

  @ViewChild('config') config!: M5PaperConfigComponent;

  remoteName = "M5 Paper";

  constructor(private remoteService: RemotesService, private snackBar: SnackbarService) { }

  ngOnInit(): void {
  }

 saveConfig(){

    const observer = {
      next: (result: any) => {
        if (result.message === 'success') {
          console.log('Config saved!')
          this.snackBar.okToast('Config saved!');
        } else {
          console.log('Config save failed!')
          this.snackBar.okToast('Script settings save failed!');
        }
      },
      error: (err: any) => {
        console.error(err);
        this.snackBar.okToast('Config save failed!');
      }
    };

    this.remoteService.saveRemoteConfig(JSON.stringify(this.config.m5Config)).subscribe(observer);
  }

}
