import { Component, OnInit } from '@angular/core';
import { faChevronLeft, faChevronRight } from '@fortawesome/free-solid-svg-icons';
import { Script } from 'astros-common';
import { ScriptsService } from 'src/app/services/scripts/scripts.service';
import { M5Page } from './models/m5-page';

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

  constructor(private scriptService: ScriptsService) { 
    this.m5Config.push(new M5Page);
    this.m5Config.push(new M5Page);
    this.m5Config.push(new M5Page);

    this.currentPage = this.m5Config[this.currentIndex];
  }

  ngOnInit(): void {
    const observer = {
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

    this.scriptService.getAllScripts().subscribe(observer);
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
