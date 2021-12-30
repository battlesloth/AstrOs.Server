import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { Guid } from 'guid-typescript';
import { Script } from 'src/app/models/scripts/script';
import { ScriptsService } from 'src/app/services/scripts/scripts.service';

@Component({
  selector: 'app-scripts',
  templateUrl: './scripts.component.html',
  styleUrls: ['./scripts.component.scss']
})
export class ScriptsComponent implements OnInit {

  scripts: Array<Script>

  constructor(private router: Router, private scriptService: ScriptsService) { 
    this.scripts = new Array<Script>();
  }

  ngOnInit(): void {
    const observer = {
      next: (result: Script[]) => this.scripts = result,
      error: (err: any) => console.error(err)
    };

    this.scriptService.getAllScripts().subscribe(observer);
  }

  newScript(){
    this.router.navigate(['scripter', '0']);
  }

}
