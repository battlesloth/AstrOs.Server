import { Component, OnInit } from '@angular/core';
import { MatExpansionPanel } from '@angular/material/expansion';


@Component({
  selector: 'app-modules',
  templateUrl: './modules.component.html',
  styleUrls: ['./modules.component.scss'],
  viewProviders: [MatExpansionPanel]
})
export class ModulesComponent implements OnInit {

  constructor() { }

  ngOnInit(): void {
  }

}
