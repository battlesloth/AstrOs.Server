import { Component, Input, OnInit } from '@angular/core';
import { MatExpansionPanel } from '@angular/material/expansion';
import { MatFormField } from '@angular/material/form-field';
import { ControlModule } from '../../../models/control-module';

@Component({
  selector: 'app-esp-module',
  templateUrl: './esp-module.component.html',
  styleUrls: ['./esp-module.component.scss'],
  viewProviders: [MatExpansionPanel, MatFormField]
})
export class EspModuleComponent implements OnInit {

  @Input()
  module!: ControlModule;

  constructor() { }

  ngOnInit(): void {
  }

}
