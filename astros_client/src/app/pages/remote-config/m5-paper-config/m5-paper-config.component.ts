import { Component, OnInit } from '@angular/core';
import { faChevronLeft, faChevronRight } from '@fortawesome/free-solid-svg-icons';
import { M5Page, Script } from 'astros-common';
import { RemotesService } from 'src/app/services/remotes/remotes.service';
import { ScriptsService } from 'src/app/services/scripts/scripts.service';
import { SnackbarService } from 'src/app/services/snackbar/snackbar.service';


@Component({
  selector: 'app-m5-paper-config',
  templateUrl: './m5-paper-config.component.html',
  styleUrls: ['./m5-paper-config.component.scss']
})
export class M5PaperConfigComponent implements OnInit {

  faForward = faChevronRight;
  faBackward = faChevronLeft;
  pageNumber = 1;

  scripts: Array<any> = [];

  m5Config: Array<M5Page> = [];
  
  currentPage: M5Page;
  currentIndex: number = 0;

  constructor(private scriptService: ScriptsService, 
    private remoteService: RemotesService) { 
    this.m5Config.push(new M5Page);
    this.m5Config.push(new M5Page);
    this.m5Config.push(new M5Page);

    this.currentPage = this.m5Config[this.currentIndex];
  }

  ngOnInit(): void {
    const scriptObserver = {
      next: (result: Script[]) => {
        const scriptList = result.sort((a, b) => {
          if (a.scriptName > b.scriptName) { return 1; }
          if (a.scriptName < b.scriptName) { return -1; }
          return 0;
        });

        for (const s of scriptList){
          this.scripts.push({id: s.id, name: s.scriptName});
        }
      },
      error: (err: any) => console.error(err)
    };

    const configObserver = {
      next: (result: any) => {
        let config = JSON.parse(result.value) as Array<M5Page>;

        if (config.length != 0){
          this.m5Config = config;
          this.currentPage = this.m5Config[0];
        }
      }
    }

    this.scriptService.getAllScripts().subscribe(scriptObserver);
    this.remoteService.getRemoteConfig().subscribe(configObserver);
  }

  pageForward(){
    this.currentIndex++;
    if (this.m5Config.length < this.currentIndex + 1){
      this.m5Config.push(new M5Page);
    }

    this.currentPage = this.m5Config[this.currentIndex];
    this.pageNumber = this.currentIndex + 1;
  }

  pageBackward(){
    this.currentIndex--;
    if (this.currentIndex < 0){
      this.currentIndex = 0;
      return;
    }

    this.currentPage = this.m5Config[this.currentIndex];
    this.pageNumber = this.currentIndex + 1;
  }
}
