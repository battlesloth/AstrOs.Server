import { NgIf } from '@angular/common';
import {
  Component,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatCheckboxModule } from '@angular/material/checkbox';

@Component({
  selector: 'app-servo-settings',
  imports: [MatCheckboxModule, FormsModule, NgIf],
  templateUrl: './servo-settings.component.html',
  styleUrl: './servo-settings.component.scss',
})
export class ServoSettingsComponent implements OnChanges {
  @Input() testId!: string;

  @Input() enabled = false;

  @Input() name = '';
  @Output() nameChange = new EventEmitter<string>();

  @Input() invert = false;
  @Output() invertChange = new EventEmitter<boolean>();

  @Input() isServo = false;

  @Input() minPulse = 500;
  @Output() minPulseChange = new EventEmitter<number>();

  @Input() maxPulse = 2500;
  @Output() maxPulseChange = new EventEmitter<number>();

  @Input() homePosition = 1500;
  @Output() homePositionChange = new EventEmitter<number>();

  typeLabel = 'Default High';

  ngOnChanges(_: SimpleChanges): void {
    this.typeLabel = this.isServo ? 'Inverted' : 'Default High';
  }

  onNameChange(): void {
    this.nameChange.emit(this.name);
  }

  onInvertChange(): void {
    this.invertChange.emit(this.invert);
  }

  onMinPulseChange(): void {
    this.minPulseChange.emit(this.minPulse);
  }

  onMaxPulseChange(): void {
    this.maxPulseChange.emit(this.maxPulse);
  }

  onHomeChange(): void {
    this.homePositionChange.emit(this.homePosition);
  }
}
