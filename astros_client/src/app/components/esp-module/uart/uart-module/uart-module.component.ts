import { Component } from '@angular/core';
import {
  MatExpansionPanel,
  MatExpansionPanelHeader,
  MatExpansionPanelTitle,
} from '@angular/material/expansion';

@Component({
  selector: 'app-uart-module',
  templateUrl: './uart-module.component.html',
  styleUrl: './uart-module.component.scss',
  imports: [MatExpansionPanel, MatExpansionPanelHeader, MatExpansionPanelTitle],
})
export class UartModuleComponent {}
