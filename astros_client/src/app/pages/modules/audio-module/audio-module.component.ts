import { Component, Input, OnInit, ViewChild, ViewContainerRef } from '@angular/core';
import { AudioModule, AudioModuleType } from 'astros-common';
import { DfPlayerComponent } from './df-player/df-player.component';
import { CyborgComponent } from './cyborg/cyborg.component';
import { ServerComponent } from './server/server.component';

@Component({
  selector: 'app-audio-module',
  templateUrl: './audio-module.component.html',
  styleUrls: ['./audio-module.component.scss']
})
export class AudioModuleComponent implements OnInit {

  @Input()
  module!: AudioModule;

  @ViewChild('audioContainer', { read: ViewContainerRef }) audioContainer!: ViewContainerRef;

  audioType!: string;
  originalAudioModule!: AudioModule;
  settings!: Map<string, string> 
  components: Array<any>;

  constructor() { 
    this.components = new Array<any>();
  }

  ngOnInit(): void {
    
  }

  ngOnChanges(){
    if (this.originalAudioModule === undefined &&
      this.module !== undefined){
        this.originalAudioModule = this.copyAudioModule(this.module);
        this.settings = this.module.settings;
        this.setAudioModule(this.module);
        this.audioType = this.module.type.toString();
      }
  }

  audioTypeChange($event: any){

    const at = +$event;

    if (at === this.originalAudioModule.type){
      this.setAudioModule(this.originalAudioModule);
    } else {
      let module = new AudioModule();
      module.type = at;
      this.setAudioModule(module);
    }
  }


  setAudioModule(module: AudioModule){
    let component: any;

    this.audioContainer.clear();
    this.components.splice(0, this.components.length);

    switch(module.type){
      case AudioModuleType.DfPlayer:
        component = this.audioContainer.createComponent(DfPlayerComponent);  
        break;
      case AudioModuleType.HumanCyborgRelations:
        component = this.audioContainer.createComponent(CyborgComponent);
        component.instance.controller = this.safeGetValue('controller','1'); 
        component.instance.serialPort = this.safeGetValue('serial','1');
        break;
      case AudioModuleType.Server:
        component = this.audioContainer.createComponent(ServerComponent);  
        break;
    }

    this.module.type = module.type;
    if (component){
      component.instance.modalCallback.subscribe((evt: any) => {
        this.settingChangeCallback(evt);
      });
      component.instance.settings = this.module.settings;
      this.components.push(component);
    }
  }


  settingChangeCallback(evt: any) {
    this.module.settings.set(evt.key, evt.value);
  }

  copyAudioModule(module: AudioModule): AudioModule {
    let temp = new AudioModule();

    temp.setType(AudioModule.getType(module));

    Array.from(module.settings).forEach( (kvp) =>{
      temp.settings.set(kvp[0], kvp[1]);
    });

    return temp;
  }

  safeGetValue(key: string, def: string){
      if (this.module.settings.has(key)){
        return this.module.settings.get(key);
      }
    return def;
  }
}
