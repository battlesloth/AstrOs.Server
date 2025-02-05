import { NgIf } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatCheckboxModule } from '@angular/material/checkbox';

@Component({
  selector: 'app-servo-settings',
  imports: [
    MatCheckboxModule,
    FormsModule,
    NgIf
  ],
  templateUrl: './servo-settings.component.html',
  styleUrl: './servo-settings.component.scss'
})
export class ServoSettingsComponent
  implements OnChanges {

    @Input()
    enabled: boolean = false;

    @Input()
    name: string = '';

    @Input()
    invert: boolean = false;

    @Input()
    isServo: boolean = false;

    @Input()
    minPulse: number = 500;

    @Input()
    maxPulse: number = 2500;

    @Input()
    homePosition: number = 1500;

    typeLabel: string = "Default High"

    ngOnChanges(changes: SimpleChanges): void {
      this.typeLabel = this.isServo ? "Inverted" : "Default High"
    }
}
