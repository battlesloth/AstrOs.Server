import { Component, OnInit } from '@angular/core';
import { Guid } from 'guid-typescript';
import { Script } from 'src/app/models/Scripts/script';

@Component({
  selector: 'app-scripts',
  templateUrl: './scripts.component.html',
  styleUrls: ['./scripts.component.scss']
})
export class ScriptsComponent implements OnInit {

  scripts: Array<Script>

  constructor() { 
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
  }

}
