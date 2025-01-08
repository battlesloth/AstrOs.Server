import { Component, Input, OnInit, OnChanges } from '@angular/core';
import { KangarooX2 } from 'astros-common';
import { FormsModule } from '@angular/forms';


@Component({
    selector: 'app-kangaroo-module',
    templateUrl: './kangaroo-module.component.html',
    styleUrls: ['./kangaroo-module.component.scss'],
    standalone: true,
    imports: [FormsModule]
})
export class KangarooModuleComponent implements OnInit, OnChanges {

  @Input()
  module!: KangarooX2;

  constructor() {
   }

  ngOnInit(): void {
  
  }

  ngOnChanges(){

  }

  onNameChange(ch: number, $event: any){

  }
}
