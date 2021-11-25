import { AfterViewInit, Component, OnInit } from '@angular/core';
import { MatExpansionPanel } from '@angular/material/expansion';
import { ModulesService } from 'src/app/services/modules/modules.service';
import { ControlModule } from './control-module';

@Component({
  selector: 'app-modules',
  templateUrl: './modules.component.html',
  styleUrls: ['./modules.component.scss'],
  viewProviders: [MatExpansionPanel]
})
export class ModulesComponent implements OnInit, AfterViewInit {



  coreModule: ControlModule;
  domeModule: ControlModule;
  bodyModule: ControlModule;

  constructor(private modulesService: ModulesService) { 

    this.coreModule = new ControlModule('core', 'Core Dome Module');
    this.domeModule = new ControlModule('dome', 'Outer Dome Module');
    this.bodyModule = new ControlModule('body', 'Body Module'); 
  }
  ngAfterViewInit(): void {
    var result = this.modulesService.getModules();
  }

  ngOnInit(): void {

  }

}
