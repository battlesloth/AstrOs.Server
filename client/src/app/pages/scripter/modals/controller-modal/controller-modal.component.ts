import { Component, OnInit } from '@angular/core';
import { ChannelType, ControllerType } from 'src/app/models/control_module/control_module';
import { ChannelValue, ControllerDetails } from 'src/app/models/script-resources';
import { ModalBaseComponent } from '../../../../modal/modal-base/modal-base.component';
import { ModalCallbackEvent, ModalResources } from '../../../../shared/modal-resources';

@Component({
  selector: 'app-controller-modal',
  templateUrl: './controller-modal.component.html',
  styleUrls: ['./controller-modal.component.scss']
})
export class ControllerModalComponent extends ModalBaseComponent implements OnInit {

  errorMessage: string;

  controllers!: Map<ControllerType, ControllerDetails>;
  selectedController: ControllerType = ControllerType.none;

  private availableModules!: Map<ControllerType, Map<ChannelType, string>>;
  modules: Map<ChannelType, string>
  selectedModule: ChannelType = ChannelType.none;

  private availableChannels!: Map<ControllerType, Map<ChannelType, Array<ChannelValue>>>;
  channels: Array<ChannelValue>
  selectedChannel: number = -1;

  constructor() {
    super();

    this.errorMessage = '';

    this.modules = new Map<ChannelType, string>();
    this.channels = new Array<ChannelValue>();
  }

  override ngOnInit(): void {
    this.controllers = this.resources.get(ModalResources.controllers);
    this.availableModules = this.resources.get(ModalResources.modules);
    this.availableChannels = this.resources.get(ModalResources.channels);
  }

  modalChange($event: any) {
    // convert from string value to number for enum
    if ($event.target.id === 'controller-select') {
      this.setModules(+$event.target.value);
    }
    else if ($event.target.id === 'module-select') {
      this.setChannels(+$event.target.value);
    }
  }

  addChannel(){

    if (+this.selectedController !== ControllerType.audio
      && +this.selectedModule === ChannelType.none){
        this.errorMessage = 'Module Selection Required'
        return;
    }
    
    if (+this.selectedModule !== ChannelType.none
      && +this.selectedModule !== ChannelType.uart
      && +this.selectedChannel === -1){
        this.errorMessage = 'Channel Selection Required'
        return;
      }
    

    this.modalCallback.emit({
      id: ModalCallbackEvent.addChannel,
      controller: +this.selectedController,
      module: +this.selectedController === ControllerType.audio ? ChannelType.audio : +this.selectedModule,
      channel: +this.selectedChannel
    });
    this.clearOptions()
  }

  closeModal(){
    this.clearOptions()
    this.modalCallback.emit({id: ModalCallbackEvent.close});
  }

  private clearOptions(){
    this.selectedController = ControllerType.none;
    this.selectedModule = ChannelType.none;
    this.selectedChannel = -1;
    document.getElementById('module-select')?.setAttribute('disabled', 'disabled');
    document.getElementById('channel-select')?.setAttribute('disabled', 'disabled');
  }

  private setModules(controllerType: ControllerType) {
    if (controllerType === ControllerType.audio) {
      this.selectedModule = ChannelType.none;
      this.selectedChannel = -1;
      document.getElementById('module-select')?.setAttribute('disabled', 'disabled');
      document.getElementById('channel-select')?.setAttribute('disabled', 'disabled')
    }
    else {
      const mods = this.availableModules.get(+this.selectedController);
      if (mods) {
        this.modules = mods;
        document.getElementById('module-select')?.removeAttribute('disabled');
      }
    }
  }

  private setChannels(channelType: ChannelType) {

    if (channelType == ChannelType.uart || channelType == ChannelType.none) {
      this.selectedChannel = -1;
      document.getElementById('channel-select')?.setAttribute('disabled', 'disabled');
    }
    else {
      const chs = this.availableChannels.get(+this.selectedController)?.get(channelType);
      if (chs) {
        this.channels = chs;
        document.getElementById('channel-select')?.removeAttribute('disabled');
      }
    }
  }
}
