import { AfterViewInit, Component, OnInit } from '@angular/core';
import { MatExpansionPanel } from '@angular/material/expansion';
import { ModulesService } from 'src/app/services/modules/modules.service';
import { ControlModule, PwmChannel, I2cChannel, PwmType, UartType } from '../../models/control-module';

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

  constructor(private modulesService: ModulesService) { 

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

  saveModuleSettings(){
    const observer = {
      next: (result: any) => console.log('module settings saved!'), 
      error: (err: any) => console.error(err)
    };

    this.modulesService.saveModules([
      {key: 'core', value: this.coreModule},
      {key: 'dome', value: this.domeModule},
      {key: 'body', value: this.bodyModule},
    ]).subscribe(observer);
  }

  private parseModules(modules: any){
    modules.forEach((module: any) => {
      try {
        switch (module.key){
          case 'core':
            this.populateModule(this.coreModule, module.value);
            break;
          case 'dome':
            this.populateModule(this.domeModule, module.value);
            break;
          case 'body':
            this.populateModule(this.bodyModule, module.value);
            break;
        };
      } catch(err) {
        console.error(err);
      }
    });
  }

  private populateModule(module: ControlModule, data: any){
    module.id = data.id;
    module.name = data.name;
    
    module.uartModule.name = data.uartModule.name;
    module.uartModule.type = <UartType>  data.uartModule.type;
    
    data.pwmModule.channels.forEach((channel: any) => {
      var type = PwmType[channel.type as keyof typeof PwmType];
      module.pwmModule.channels[channel.id] =  new PwmChannel(channel.id, channel.name, type);   
    });
   
    data.i2cModule.channels.forEach((channel: any) => {
      module.i2cModule.channels[channel.id] =  new I2cChannel(channel.id, channel.name);   
    });
  }

}
