import { Component, OnInit } from '@angular/core';
import { MatExpansionPanel } from '@angular/material/expansion';
import { ControlModule } from './control-module';

@Component({
  selector: 'app-modules',
  templateUrl: './modules.component.html',
  styleUrls: ['./modules.component.scss'],
  viewProviders: [MatExpansionPanel]
})
export class ModulesComponent implements OnInit {



  coreModule: ControlModule;
  domeModule: ControlModule;
  bodyModule: ControlModule;

  constructor() { 
    this.coreModule = new ControlModule('core', 'Core Dome Module');
    this.domeModule = new ControlModule('dome', 'Outer Dome Module');
    this.bodyModule = new ControlModule('body', 'Body Module'); 
  }

  ngOnInit(): void {
  }

}
