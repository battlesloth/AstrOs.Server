import { Component, Input, OnInit } from '@angular/core';
import { KangarooX2 } from 'astros-common';


@Component({
  selector: 'app-kangaroo-module',
  templateUrl: './kangaroo-module.component.html',
  styleUrls: ['./kangaroo-module.component.scss']
})
export class KangarooModuleComponent implements OnInit {

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
