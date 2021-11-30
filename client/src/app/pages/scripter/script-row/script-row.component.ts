import { Component, Input, OnInit } from '@angular/core';
import { ScriptChannel } from 'src/app/models/script-channel';

@Component({
  selector: 'app-script-row',
  templateUrl: './script-row.component.html',
  styleUrls: ['./script-row.component.scss']
})
export class ScriptRowComponent implements OnInit {

  @Input()
  channel!: ScriptChannel

  timeLineArray: Array<number>;
  private seconds: number = 300;

  constructor() { 
    this.timeLineArray = Array.from({length: this.seconds}, (_, i) => i + 1)
  }

  ngOnInit(): void {
  }

}
