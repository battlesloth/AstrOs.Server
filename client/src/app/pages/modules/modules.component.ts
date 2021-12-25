import { Component, OnInit } from '@angular/core';
import { MatExpansionPanel } from '@angular/material/expansion';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ControllerService } from 'src/app/services/controllers/controller.service';
import { ControlModule, ControllerType } from 'src/app/models/control_module/control_module';

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

  constructor(private controllerService: ControllerService,
    private snackBar: MatSnackBar) {

        this.coreModule = new ControlModule(ControllerType.core, 'Core Dome Module');
        this.domeModule = new ControlModule(ControllerType.dome, 'Outer Dome Module');
        this.bodyModule = new ControlModule(ControllerType.body, 'Body Module'); 
      }

  ngOnInit(): void {
    const observer = {
      next: (result: any) => this.parseModules(result),
      error: (err: any) => console.error(err)
    };

    this.controllerService.getControllers().subscribe(observer);

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

    this.controllerService.saveControllers([this.coreModule, this.domeModule, this.bodyModule])
      .subscribe(observer);
  }

  private parseModules(modules: ControlModule[]) {
    modules.forEach((module: ControlModule) => {
      try {
        switch (module.id) {
          case ControllerType.core:
            this.coreModule = module;
            break;
          case ControllerType.dome:
            this.domeModule = module;
            break;
          case ControllerType.body:
            this.bodyModule = module;
            break;
        };
      } catch (err) {
        console.error(err);
      }
    });
  }
}
