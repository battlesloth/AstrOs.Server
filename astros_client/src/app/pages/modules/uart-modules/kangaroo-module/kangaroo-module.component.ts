import { Component, Input } from '@angular/core';
import { KangarooX2 } from 'astros-common';
import { FormsModule } from '@angular/forms';


@Component({
  selector: 'app-kangaroo-module',
  templateUrl: './kangaroo-module.component.html',
  styleUrls: ['./kangaroo-module.component.scss'],
  standalone: true,
  imports: [FormsModule]
})
export class KangarooModuleComponent {

  @Input()
  module!: KangarooX2;

}
