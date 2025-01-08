import { Component, ViewChild, ViewContainerRef } from '@angular/core';
import { MatExpansionPanel } from '@angular/material/expansion';

@Component({
  selector: 'app-esp-submodule',
  templateUrl: './esp-submodule.component.html',
  styleUrl: './esp-submodule.component.scss',
  imports: [MatExpansionPanel],
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
