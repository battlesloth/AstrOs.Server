import { Component, Input, OnInit } from '@angular/core';
import { MatExpansionPanel } from '@angular/material/expansion';
import { MatFormField } from '@angular/material/form-field';
import { ControlModule } from 'src/app/models/control_module/control_module';
import { PwmType } from 'src/app/models/control_module/pwm_channel';

@Component({
  selector: 'app-esp-module',
  templateUrl: './esp-module.component.html',
  styleUrls: ['./esp-module.component.scss'],
  viewProviders: [MatExpansionPanel, MatFormField]
})
export class EspModuleComponent implements OnInit {

  @Input()
  module!: ControlModule;

  pwmTypeOptions = [
    {id: PwmType.unassigned, name: "Unassigned"},
    {id: PwmType.continuous_servo, name: "Continuous Servo"},
    {id: PwmType.positional_servo, name: "Positional Servo"},
    {id: PwmType.linear_servo, name: "Linear Servo"},
    {id: PwmType.led, name: "LED"},
    {id: PwmType.high_low, name: "High/Low"}
  ]


  constructor() { }

  ngOnInit(): void {
  }

  pwmNameChange(id: number, $event: any){
    this.module.pwmModule.channels[id].channelName = $event;
  }

  pwmTypeChange(id: number, $event: any){
    this.module.pwmModule.channels[id].type = $event;
  }

}
