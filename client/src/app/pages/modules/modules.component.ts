import { Component, OnInit } from '@angular/core';
import { MatExpansionPanel } from '@angular/material/expansion';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ModulesService } from 'src/app/services/modules/modules.service';
import { ControlModule, PwmChannel, I2cChannel, PwmType, UartType } from '../../models/control-module';

@Component({
  selector: 'app-modules',
  templateUrl: './modules.component.html',
  styleUrls: ['./modules.component.scss'],
  viewProviders: [MatExpansionPanel]
})
export class ModulesComponent implements OnInit {

  coreModule!: ControlModule;
  domeModule!: ControlModule;
  bodyModule!: ControlModule;

  constructor(private modulesService: ModulesService,
    private snackBar: MatSnackBar) {

        this.coreModule = new ControlModule('core', 'Core Dome Module');
        this.domeModule = new ControlModule('dome', 'Outer Dome Module');
        this.bodyModule = new ControlModule('body', 'Body Module'); 
      }


  ngOnInit(): void {
    const observer = {
      next: (result: any) => this.parseModules(result),
      error: (err: any) => console.error(err)
    };

    this.modulesService.getModules().subscribe(observer);

  }

  saveModuleSettings() {
    const observer = {
      next: (result: any) => {
        if (result.message === 'success') {
          console.log('module settings saved!')
          this.snackBar.open('Module settings saved!', 'OK', {duration: 2000});
        } else {
          console.log('module settings save failed!', 'OK', {duration: 2000})
          this.snackBar.open('Module settings save failed!', 'OK', {duration: 2000});
        }
      },
      error: (err: any) => {
        console.error(err);
        this.snackBar.open('Module settings save failed!');
      }
    };

    this.modulesService.saveModules([this.coreModule, this.domeModule, this.bodyModule])
      .subscribe(observer);
  }

  private parseModules(modules: ControlModule[]) {
    modules.forEach((module: ControlModule) => {
      try {
        switch (module.id) {
          case 'core':
            this.coreModule = module;
            break;
          case 'dome':
            this.domeModule = module;
            break;
          case 'body':
            this.bodyModule = module;
            break;
        };
      } catch (err) {
        console.error(err);
      }
    });
  }
}
