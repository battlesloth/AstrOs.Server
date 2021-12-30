import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { Guid } from 'guid-typescript';
import { Script } from 'src/app/models/Scripts/script';
import { ScriptsService } from 'src/app/services/scripts/scripts.service';

@Component({
  selector: 'app-scripts',
  templateUrl: './scripts.component.html',
  styleUrls: ['./scripts.component.scss']
})
export class ScriptsComponent implements OnInit {

  scripts: Array<Script>

  constructor(private router: Router, private scriptService: ScriptsService) { 
    this.scripts = new Array<Script>(
      new Script(Guid.create().toString(), "Test 1", 
      "My cool test script", "1970-01-01 00:00:00.000",
      false, "1970-01-01 00:00:00.000",
      true, "1970-01-01 00:00:00.000",
      false, "1970-01-01 00:00:00.000"),
      new Script(Guid.create().toString(), "Test 2", 
      "My cool test script", "1970-01-01 00:00:00.000",
      true, "1970-01-01 00:00:00.000",
      false, "1970-01-01 00:00:00.000",
      false, "1970-01-01 00:00:00.000"),
      new Script(Guid.create().toString(), "Test 3", 
      "My cool test script", "1970-01-01 00:00:00.000",
      false, "1970-01-01 00:00:00.000",
      false, "1970-01-01 00:00:00.000",
      true, "1970-01-01 00:00:00.000"),
      new Script(Guid.create().toString(), "Test 4", 
      "My cool test script", "1970-01-01 00:00:00.000",
      false, "1970-01-01 00:00:00.000",
      false, "1970-01-01 00:00:00.000",
      false, "1970-01-01 00:00:00.000"),
    );
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
