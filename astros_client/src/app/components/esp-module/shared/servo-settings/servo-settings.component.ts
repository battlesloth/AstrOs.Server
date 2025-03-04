import { NgIf } from '@angular/common';
import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatCheckboxModule } from '@angular/material/checkbox';

@Component({
  selector: 'app-servo-settings',
  imports: [MatCheckboxModule, FormsModule, NgIf],
  templateUrl: './servo-settings.component.html',
  styleUrl: './servo-settings.component.scss',
})
export class ServoSettingsComponent implements OnChanges {
  @Input()
  enabled = false;

  @Input()
  name = '';

  @Input()
  invert = false;

  @Input()
  isServo = false;

  @Input()
  minPulse = 500;

  @Input()
  maxPulse = 2500;

  @Input()
  homePosition = 1500;

  typeLabel = 'Default High';

  ngOnChanges(_: SimpleChanges): void {
    this.typeLabel = this.isServo ? 'Inverted' : 'Default High';
  }
}
