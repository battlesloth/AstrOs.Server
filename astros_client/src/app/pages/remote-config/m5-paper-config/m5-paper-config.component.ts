import { Component, OnInit } from '@angular/core';
import {
  faChevronLeft,
  faChevronRight,
} from '@fortawesome/free-solid-svg-icons';
import { M5Page, Script } from 'astros-common';
import { RemotesService } from 'src/app/services/remotes/remotes.service';
import { ScriptsService } from 'src/app/services/scripts/scripts.service';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { FormsModule } from '@angular/forms';
import { NgFor } from '@angular/common';

interface ScriptSelection {
  id: string;
  name: string;
}

@Component({
  selector: 'app-m5-paper-config',
  templateUrl: './m5-paper-config.component.html',
  styleUrls: ['./m5-paper-config.component.scss'],
  imports: [FontAwesomeModule, FormsModule, NgFor],
})
export class M5PaperConfigComponent implements OnInit {
  faForward = faChevronRight;
  faBackward = faChevronLeft;
  pageNumber = 1;

  scripts: ScriptSelection[] = [];

  m5Config: M5Page[] = [];

  currentPage: M5Page;
  currentIndex = 0;

  currentButton1Script = '0';
  currentButton2Script = '0';
  currentButton3Script = '0';
  currentButton4Script = '0';
  currentButton5Script = '0';
  currentButton6Script = '0';
  currentButton7Script = '0';
  currentButton8Script = '0';
  currentButton9Script = '0';


  constructor(
    private scriptService: ScriptsService,
    private remoteService: RemotesService,
  ) {
    this.m5Config.push(new M5Page());

    this.currentPage = this.m5Config[this.currentIndex];
  }

  ngOnInit(): void {
    const scriptObserver = {
      next: (result: Script[]) => {
        const scriptList = result.sort((a, b) => {
          if (a.scriptName > b.scriptName) {
            return 1;
          }
          if (a.scriptName < b.scriptName) {
            return -1;
          }
          return 0;
        });

        for (const s of scriptList) {
          this.scripts.push({ id: s.id, name: s.scriptName });
        }
        this.loadConfig();
      },
      error: (err: unknown) => console.error(err),
    };

    this.scriptService.getAllScripts().subscribe(scriptObserver);
  }

  loadConfig() {
    const configObserver = {
      next: (result: unknown) => {

        if (result && typeof result === 'string' && result.length > 0) {
          const config = JSON.parse(result as string) as M5Page[];

          if (config.length != 0) {
            this.m5Config = config;
            this.currentPage = this.m5Config[0];
            this.setButtonScripts();
          }
        } else {
          this.m5Config = new Array<M5Page>();
          this.m5Config.push(new M5Page());
          this.currentPage = this.m5Config[0];
          this.setButtonScripts();
        }
      },
    };

    this.remoteService.getRemoteConfig().subscribe(configObserver);
  }

  selectionChange(button: number, newId: string) {

    let id = newId;
    let scriptName = 'None';

    if (id !== '0') {
      const sIdx = this.scripts
        .map((s) => {
          return s.id;
        })
        .indexOf(id);
      if (sIdx === -1) {
        console.error(`Script ID ${id} not found in scripts list.`);
        id = '0';
        scriptName = 'None';

      } else {
        scriptName = this.scripts[sIdx].name;
      }
    }

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
      this.m5Config.push(new M5Page());
    }

    this.currentPage = this.m5Config[this.currentIndex];
    this.pageNumber = this.currentIndex + 1;
    this.setButtonScripts();
  }

  pageBackward() {
    this.currentIndex--;
    if (this.currentIndex < 0) {
      this.currentIndex = 0;
      return;
    }

    this.currentPage = this.m5Config[this.currentIndex];
    this.pageNumber = this.currentIndex + 1;
    this.setButtonScripts();
  }

  setButtonScripts() {
    this.currentButton1Script = this.currentPage.button1?.id || '0';
    this.currentButton2Script = this.currentPage.button2?.id || '0';
    this.currentButton3Script = this.currentPage.button3?.id || '0';
    this.currentButton4Script = this.currentPage.button4?.id || '0';
    this.currentButton5Script = this.currentPage.button5?.id || '0';
    this.currentButton6Script = this.currentPage.button6?.id || '0';
    this.currentButton7Script = this.currentPage.button7?.id || '0';
    this.currentButton8Script = this.currentPage.button8?.id || '0';
    this.currentButton9Script = this.currentPage.button9?.id || '0';
  }
}
