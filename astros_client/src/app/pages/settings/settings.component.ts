import { KeyValue } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { SettingsService } from 'src/app/services/settings/settings.service';
import { SnackbarService } from 'src/app/services/snackbar/snackbar.service';

@Component({
  selector: 'app-settings',
  templateUrl: './settings.component.html',
  styleUrls: ['./settings.component.scss']
})
export class SettingsComponent implements OnInit {

  apiKey ="";
  private characters: string = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  constructor(private settingsService: SettingsService) { }

  ngOnInit(): void {
    const observer = {
      next: (result: KeyValue<string, string>) => {
        this.apiKey = result.value;
      },
      error: (err: any) => console.error(err)
    };

    this.settingsService.getSetting('apikey').subscribe(observer);
  }

  generateApiKey(){
    let result = '';
    let charactersLength = this.characters.length;
    for (var i = 0; i < 10; i++) {
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

    this.settingsService.saveSetting({key: 'apikey', value: result}).subscribe(observer);
  }

}
