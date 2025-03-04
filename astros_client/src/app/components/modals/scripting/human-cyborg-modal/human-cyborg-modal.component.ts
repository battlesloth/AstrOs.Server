import { Component, OnInit } from '@angular/core';
import {
  BaseEventModalComponent,
  ScriptEventModalResources,
} from '../base-event-modal/base-event-modal.component';
import {
  HcrCommand,
  HcrCommandCategory,
  HumanCyborgRelationsCmd,
  HumanCyborgRelationsEvent,
  HumanCyborgRelationsModule,
  ScriptEvent,
} from 'astros-common';
import { faBan } from '@fortawesome/free-solid-svg-icons';
import { FormsModule } from '@angular/forms';
import { NgFor, DecimalPipe } from '@angular/common';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { ModalCallbackEvent } from '../../modal-base/modal-callback-event';

interface HcrCommandListItem {
  id: HumanCyborgRelationsCmd;
  name: string;
}

export class HcrModalResources {
  public static channelId = 'channelId';
  public static baudRate = 'baudRate';
  public static scriptEvent = 'scriptEvent';
}

@Component({
  selector: 'app-human-cyborg-modal',
  templateUrl: './human-cyborg-modal.component.html',
  styleUrls: [
    '../base-event-modal/base-event-modal.component.scss',
    './human-cyborg-modal.component.scss',
  ],
  imports: [FormsModule, NgFor, FontAwesomeModule, DecimalPipe],
})
export class HumanCyborgModalComponent
  extends BaseEventModalComponent
  implements OnInit
{
  faRemove = faBan;

  uartChannel!: number;
  baudRate!: number;
  commandCategory: string;
  command!: string;
  valueA!: string;
  valueB!: string;

  selectedCommands: HcrCommand[];
  commands: HcrCommandListItem[];

  hasValueA: HumanCyborgRelationsCmd[];
  hasValueB: HumanCyborgRelationsCmd[];

  constructor() {
    super();
    this.originalEventTime = 0;
    this.eventTime = 0;

    this.selectedCommands = new Array<HcrCommand>();
    this.commands = new Array<HcrCommandListItem>();
    this.commandCategory = HcrCommandCategory.stimuli.toString();
    this.setAvailableCommands(+this.commandCategory);

    this.hasValueA = new Array<HumanCyborgRelationsCmd>();
    this.hasValueA.push(
      HumanCyborgRelationsCmd.minSecondsBetweenMusings,
      HumanCyborgRelationsCmd.maxSecondsBetweenMusings,
      HumanCyborgRelationsCmd.playWavOnA,
      HumanCyborgRelationsCmd.playWavOnB,
      HumanCyborgRelationsCmd.vocalizerVolume,
      HumanCyborgRelationsCmd.wavAVolume,
      HumanCyborgRelationsCmd.wavBVolume,
      HumanCyborgRelationsCmd.setHappyLevel,
      HumanCyborgRelationsCmd.setSadLevel,
      HumanCyborgRelationsCmd.setMadLevel,
      HumanCyborgRelationsCmd.setScaredLevel,
    );

    this.hasValueB = new Array<HumanCyborgRelationsCmd>();
    this.hasValueB.push(
      HumanCyborgRelationsCmd.playSdRandomOnA,
      HumanCyborgRelationsCmd.playSdRandomOnB,
    );

    this.errorMessage = '';
    this.callbackType = ScriptEventModalResources.addEvent;
  }

  ngOnInit(): void {
    if (this.resources.has(ScriptEventModalResources.callbackType)) {
      this.callbackType = this.resources.get(
        ScriptEventModalResources.callbackType,
      ) as string;
    }

    if (this.callbackType === ScriptEventModalResources.editEvent) {
      const element = document.getElementById('remove_button');
      element?.classList.remove('hidden');
    }

    this.uartChannel = this.resources.get(
      HcrModalResources.channelId,
    ) as number;
    this.baudRate = this.resources.get(HcrModalResources.baudRate) as number;
    this.scriptEvent = this.resources.get(
      HcrModalResources.scriptEvent,
    ) as ScriptEvent;

    const temp = this.scriptEvent.event as HumanCyborgRelationsEvent;

    this.selectedCommands.push(...temp.commands);

    this.originalEventTime = this.scriptEvent.time / this.timeFactor;
    this.eventTime = this.scriptEvent.time / this.timeFactor;
  }

  categoryChange(_: unknown) {
    this.errorMessage = '';
    this.setAvailableCommands(+this.commandCategory);
  }

  commandChange(_: unknown) {
    this.errorMessage = '';
    if (this.hcrHasBValue(+this.command)) {
      document.getElementById('value-a')?.removeAttribute('disabled');
      document.getElementById('value-b')?.removeAttribute('disabled');
      return;
    }
    if (this.hcrHasAValue(+this.command)) {
      document.getElementById('value-a')?.removeAttribute('disabled');
      document.getElementById('value-b')?.setAttribute('disabled', 'disabled');
      return;
    }

    document.getElementById('value-a')?.setAttribute('disabled', 'disabled');
    document.getElementById('b')?.setAttribute('disabled', 'disabled');
  }

  setAvailableCommands(category: HcrCommandCategory) {
    this.commands.splice(0);

    switch (category) {
      case HcrCommandCategory.stimuli:
        this.commands.push(
          this.hcrListItem(HumanCyborgRelationsCmd.mildHappy),
          this.hcrListItem(HumanCyborgRelationsCmd.extremeHappy),
          this.hcrListItem(HumanCyborgRelationsCmd.mildSad),
          this.hcrListItem(HumanCyborgRelationsCmd.extremeSad),
          this.hcrListItem(HumanCyborgRelationsCmd.mildAngry),
          this.hcrListItem(HumanCyborgRelationsCmd.extremeAngry),
          this.hcrListItem(HumanCyborgRelationsCmd.mildScared),
          this.hcrListItem(HumanCyborgRelationsCmd.extremeScared),
          this.hcrListItem(HumanCyborgRelationsCmd.overload),
        );
        break;
      case HcrCommandCategory.muse:
        this.commands.push(
          this.hcrListItem(HumanCyborgRelationsCmd.enableMuse),
          this.hcrListItem(HumanCyborgRelationsCmd.disableMuse),
          this.hcrListItem(HumanCyborgRelationsCmd.toggleMuse),
          this.hcrListItem(HumanCyborgRelationsCmd.triggerMusing),
          this.hcrListItem(HumanCyborgRelationsCmd.minSecondsBetweenMusings),
          this.hcrListItem(HumanCyborgRelationsCmd.maxSecondsBetweenMusings),
        );
        break;
      case HcrCommandCategory.sdWav:
        this.commands.push(
          this.hcrListItem(HumanCyborgRelationsCmd.playWavOnA),
          this.hcrListItem(HumanCyborgRelationsCmd.playWavOnB),
          this.hcrListItem(HumanCyborgRelationsCmd.playSdRandomOnA),
          this.hcrListItem(HumanCyborgRelationsCmd.playSdRandomOnB),
        );
        break;
      case HcrCommandCategory.stop:
        this.commands.push(
          this.hcrListItem(HumanCyborgRelationsCmd.panicStop),
          this.hcrListItem(HumanCyborgRelationsCmd.gracefulStop),
          this.hcrListItem(HumanCyborgRelationsCmd.stopWavOnA),
          this.hcrListItem(HumanCyborgRelationsCmd.stopWavOnB),
        );
        break;
      case HcrCommandCategory.volume:
        this.commands.push(
          this.hcrListItem(HumanCyborgRelationsCmd.vocalizerVolume),
          this.hcrListItem(HumanCyborgRelationsCmd.wavAVolume),
          this.hcrListItem(HumanCyborgRelationsCmd.wavBVolume),
        );
        break;
      case HcrCommandCategory.override:
        this.commands.push(
          this.hcrListItem(HumanCyborgRelationsCmd.enableImprov),
          this.hcrListItem(HumanCyborgRelationsCmd.enableCanonical),
          this.hcrListItem(HumanCyborgRelationsCmd.enablePersonalityOverride),
          this.hcrListItem(HumanCyborgRelationsCmd.disablePersonalityOverride),
          this.hcrListItem(HumanCyborgRelationsCmd.zeroEmotions),
          this.hcrListItem(HumanCyborgRelationsCmd.setHappyLevel),
          this.hcrListItem(HumanCyborgRelationsCmd.setSadLevel),
          this.hcrListItem(HumanCyborgRelationsCmd.setMadLevel),
          this.hcrListItem(HumanCyborgRelationsCmd.setScaredLevel),
        );
        break;
    }

    if (this.commands.length > 0) {
      this.command = this.commands[0].id.toString();
    }
  }

  addCommand() {
    let missingA = false;
    let missingB = false;

    if (this.hcrHasBValue(+this.command)) {
      if (this.valueA === undefined || this.valueA === null) {
        missingA = true;
      }
      if (this.valueB === undefined || this.valueB === null) {
        missingB = true;
      }
    }

    if (this.hcrHasAValue(+this.command)) {
      if (this.valueA === undefined || this.valueA === null) {
        missingA = true;
      }
    }

    if (missingA || missingB) {
      this.errorMessage = `Required Values Missing: ${missingA ? 'A' : ''}${missingA && missingB ? ',' : ''}${missingB ? 'B' : ''}`;
      return;
    }

    this.selectedCommands.push(
      new HcrCommand(
        crypto.randomUUID().toString(),
        +this.commandCategory,
        +this.command,
        +this.valueA,
        +this.valueB,
      ),
    );
  }

  removeCommand(id: string) {
    const cmdIdx = this.selectedCommands?.findIndex((x) => x.id === id);
    if (cmdIdx != undefined && cmdIdx > -1) {
      this.selectedCommands.splice(cmdIdx, 1);
    }
  }

  addEvent() {
    if (+this.eventTime > this.maxTime) {
      this.errorMessage = `Event time cannot be larger than ${this.maxTime / this.timeFactor}`;
      return;
    }

    this.scriptEvent.time = +this.eventTime * this.timeFactor;

    const data = new HumanCyborgRelationsEvent(this.selectedCommands);

    this.scriptEvent.event = data;

    const evt = new ModalCallbackEvent(this.callbackType, {
      scriptEvent: this.scriptEvent,
      time: this.originalEventTime,
    });
    this.modalCallback.emit(evt);
  }

  formatSelectedCommand(cmd: HcrCommand) {
    if (this.hcrHasBValue(cmd.command)) {
      return `${this.hcrName(cmd.command)}: ${cmd.valueA} ${cmd.valueB}`;
    }

    if (this.hcrHasAValue(cmd.command)) {
      return `${this.hcrName(cmd.command)}: ${cmd.valueA}`;
    }

    return this.hcrName(cmd.command);
  }

  hcrListItem(cmd: HumanCyborgRelationsCmd) {
    return { id: cmd, name: this.hcrName(cmd) };
  }

  hcrName(cmd: HumanCyborgRelationsCmd) {
    return HumanCyborgRelationsModule.getCommandName(cmd);
  }

  hcrHasBValue(cmd: HumanCyborgRelationsCmd) {
    return this.hasValueB.find((x) => x === cmd) !== undefined;
  }

  hcrHasAValue(cmd: HumanCyborgRelationsCmd) {
    return this.hasValueA.find((x) => x === cmd) !== undefined;
  }
}
