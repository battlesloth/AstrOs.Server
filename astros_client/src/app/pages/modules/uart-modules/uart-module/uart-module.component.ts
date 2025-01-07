import { Component } from '@angular/core';
import { MatExpansionPanel } from '@angular/material/expansion';

@Component({
  selector: 'app-uart-module',
  templateUrl: './uart-module.component.html',
  styleUrl: './uart-module.component.scss',
  viewProviders: [MatExpansionPanel]
})
export class UartModuleComponent {

}
