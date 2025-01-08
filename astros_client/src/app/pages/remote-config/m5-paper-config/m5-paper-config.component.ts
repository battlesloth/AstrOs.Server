import { Component, OnInit } from '@angular/core';
import { faChevronLeft, faChevronRight } from '@fortawesome/free-solid-svg-icons';
import { M5Page, Script } from 'astros-common';
import { RemotesService } from 'src/app/services/remotes/remotes.service';
import { ScriptsService } from 'src/app/services/scripts/scripts.service';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { FormsModule } from '@angular/forms';
import { NgFor } from '@angular/common';


@Component({
    selector: 'app-m5-paper-config',
    templateUrl: './m5-paper-config.component.html',
    styleUrls: ['./m5-paper-config.component.scss'],
    standalone: true,
    imports: [FontAwesomeModule, FormsModule, NgFor]
})
export class M5PaperConfigComponent implements OnInit {

  faForward = faChevronRight;
  faBackward = faChevronLeft;
  pageNumber = 1;

  scripts: any[] = [];

  m5Config: M5Page[] = [];

  currentPage: M5Page;
  currentIndex = 0;

  constructor(private scriptService: ScriptsService,
    private remoteService: RemotesService) {
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

        for (const s of scriptList) {
          this.scripts.push({ id: s.id, name: s.scriptName });
        }
      },
      error: (err: any) => console.error(err)
    };

    const configObserver = {
      next: (result: any) => {

        if (result !== undefined) {
          const config = JSON.parse(result.value) as M5Page[];

          if (config.length != 0) {
            this.m5Config = config;
            this.currentPage = this.m5Config[0];
          }
        }
        else {
          this.m5Config = new Array<M5Page>();
          this.m5Config.push(new M5Page());
          this.currentPage = this.m5Config[0];
        }
      }
    }

    this.scriptService.getAllScripts().subscribe(scriptObserver);
    this.remoteService.getRemoteConfig().subscribe(configObserver);
  }

  selectionChange(button: number, id: any) {

    const sIdx = this.scripts
      .map((s) => { return s.id })
      .indexOf(id);

    const scriptName = this.scripts[sIdx].name;

    switch (button) {
      case 1:
        this.currentPage.button1.id = id;
        this.currentPage.button1.name = scriptName;
        break;
      case 2:
        this.currentPage.button2.id = id;
        this.currentPage.button2.name = scriptName;
        break;
      case 3:
        this.currentPage.button3.id = id;
        this.currentPage.button3.name = scriptName;
        break;
      case 4:
        this.currentPage.button4.id = id;
        this.currentPage.button4.name = scriptName;
        break;
      case 5:
        this.currentPage.button5.id = id;
        this.currentPage.button5.name = scriptName;
        break;
      case 6:
        this.currentPage.button6.id = id;
        this.currentPage.button6.name = scriptName;
        break;
      case 7:
        this.currentPage.button7.id = id;
        this.currentPage.button7.name = scriptName;
        break;
      case 8:
        this.currentPage.button8.id = id;
        this.currentPage.button8.name = scriptName;
        break;
      case 9:
        this.currentPage.button9.id = id;
        this.currentPage.button9.name = scriptName;
        break;
    }
  }

  pageForward() {
    this.currentIndex++;
    if (this.m5Config.length < this.currentIndex + 1) {
      this.m5Config.push(new M5Page);
    }

    this.currentPage = this.m5Config[this.currentIndex];
    this.pageNumber = this.currentIndex + 1;
  }

  pageBackward() {
    this.currentIndex--;
    if (this.currentIndex < 0) {
      this.currentIndex = 0;
      return;
    }

    this.currentPage = this.m5Config[this.currentIndex];
    this.pageNumber = this.currentIndex + 1;
  }
}
