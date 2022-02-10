import { Component, Input, OnInit } from '@angular/core';
import { KangarooController } from 'astros-common';


@Component({
  selector: 'app-kangaroo-module',
  templateUrl: './kangaroo-module.component.html',
  styleUrls: ['./kangaroo-module.component.scss']
})
export class KangarooModuleComponent implements OnInit {

  @Input()
  module!: KangarooController;

  constructor() {
   }

  ngOnInit(): void {
  
  }

  ngOnChanges(){

  }

  onNameChange(ch: number, $event: any){

  }
}
