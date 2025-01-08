import { Component, ViewChild, ViewContainerRef } from '@angular/core';
import { MatAccordion, MatExpansionPanel, MatExpansionPanelHeader, MatExpansionPanelTitle } from '@angular/material/expansion';

@Component({
  selector: 'app-esp-submodule',
  templateUrl: './esp-submodule.component.html',
  styleUrl: './esp-submodule.component.scss',
  imports: [
    MatAccordion,
    MatExpansionPanel,
    MatExpansionPanelHeader,
    MatExpansionPanelTitle
  ],
  standalone: true
})
export class EspSubmoduleComponent {

  @ViewChild('configContainer', { read: ViewContainerRef })
  get configContainer(): ViewContainerRef { return this._configContainer; }
  set configContainer(value: ViewContainerRef) {
    this._configContainer = value;
  }
  _configContainer!: ViewContainerRef;
}
