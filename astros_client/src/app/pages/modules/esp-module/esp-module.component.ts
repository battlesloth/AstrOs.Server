import { Component, Input, OnInit, ViewChild, ViewContainerRef } from '@angular/core';
import { MatExpansionPanel } from '@angular/material/expansion';
import { MatCheckboxModule } from '@angular/material/checkbox'
import { MatFormField } from '@angular/material/form-field';
import { ControlModule , KangarooController, UartType } from 'astros-common';
import { KangarooModuleComponent } from '../uart-modules/kangaroo-module/kangaroo-module.component';

@Component({
  selector: 'app-esp-module',
  templateUrl: './esp-module.component.html',
  styleUrls: ['./esp-module.component.scss'],
  viewProviders: [MatExpansionPanel, MatFormField, MatCheckboxModule]
})
export class EspModuleComponent implements OnInit {

  @Input()
  module!: ControlModule;
  
  @ViewChild('uartContainer', { read: ViewContainerRef }) uartContainer!: ViewContainerRef;

  originalUartType!: UartType;
  originalUartModule!: any;
  
  components: Array<any>;
  uartType: string;

  constructor() { 
    this.components = new Array<any>();
    this.uartType = '0';
  }

  ngOnInit(): void {
  }

  ngOnChanges(){
    if (this.originalUartType === undefined && 
      this.module !== undefined && 
      this.uartContainer !== undefined){

      this.originalUartType = this.module.uartModule.type;
      this.originalUartModule = this.copyUartModule(this.module.uartModule);

      this.uartType = this.originalUartType.toString();
      this.setUartModule(this.originalUartType, this.originalUartModule);
    }
  }

  servoNameChange(id: number, $event: any){
    this.module.servoModule.channels[id].channelName = $event;
  }

  servoStatusChange(id: number, $event: any){
    this.module.servoModule.channels[id].enabled = $event;
  }

  uartTypeChange($event: any){

    const ut = +$event;

    if (ut === this.originalUartType){
      this.setUartModule(this.originalUartType, this.originalUartModule);
      
    } else {

      let module: any;
      switch (ut){
        case UartType.kangaroo:
          module = new KangarooController();
          break;
        default:
          module = new Object();
          break;
      }

      this.setUartModule(ut, module);
    }
  }

  setUartModule(uartType: UartType, module: any){
    let component: any;
    
    this.uartContainer.clear()
    this.components.splice(0, this.components.length);

    switch (uartType){
      case UartType.kangaroo:
        component = this.uartContainer.createComponent(KangarooModuleComponent);
        break;
    }

    this.module.uartModule.type = uartType;
    this.module.uartModule.module = module;

    if (component){
      component.instance.module = module; 

      this.components.push(component);
    } 
  }

  moduleCallback(evt: any) {
    throw new Error('Method not implemented.');
  }

  copyUartModule(module: any): any {
    let temp: any;

    switch (module.type){
        case UartType.kangaroo:
            temp = new KangarooController();
            temp.channelOneName = module.module.channelOneName;
            temp.channelTwoName = module.module.channelTwoName;
            break;
        default:
            temp = new Object();
            break;
    }

    return temp;
  }
}
