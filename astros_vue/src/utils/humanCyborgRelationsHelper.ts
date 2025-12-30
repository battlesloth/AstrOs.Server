import { HumanCyborgRelationsCmd } from '@/enums/scripts/humanCyborgRelations';

export class HumanCyborgRelationsHelper {
  static getCommandName(cmd: HumanCyborgRelationsCmd): string {
    switch (cmd) {
      case HumanCyborgRelationsCmd.mildHappy:
        return 'Mild Happy';
      case HumanCyborgRelationsCmd.extremeHappy:
        return 'Extreme Happy';
      case HumanCyborgRelationsCmd.mildSad:
        return 'Mild Sad';
      case HumanCyborgRelationsCmd.extremeSad:
        return 'Extreme Sad';
      case HumanCyborgRelationsCmd.mildAngry:
        return 'Mild Angry';
      case HumanCyborgRelationsCmd.extremeAngry:
        return 'Extreme Angry';
      case HumanCyborgRelationsCmd.mildScared:
        return 'Mild Scared';
      case HumanCyborgRelationsCmd.extremeScared:
        return 'Extreme Scared';
      case HumanCyborgRelationsCmd.overload:
        return 'Overload';
      case HumanCyborgRelationsCmd.enableMuse:
        return 'Enable Muse';
      case HumanCyborgRelationsCmd.disableMuse:
        return 'Disable Muse';
      case HumanCyborgRelationsCmd.toggleMuse:
        return 'Toggle Muse';
      case HumanCyborgRelationsCmd.triggerMusing:
        return 'Trigger Muse';
      case HumanCyborgRelationsCmd.minSecondsBetweenMusings:
        return 'Min Seconds Between';
      case HumanCyborgRelationsCmd.maxSecondsBetweenMusings:
        return 'Max Seconds Between';
      case HumanCyborgRelationsCmd.playWavOnA:
        return 'Play WAV on CH A';
      case HumanCyborgRelationsCmd.playWavOnB:
        return 'Play WAV on CH B';
      case HumanCyborgRelationsCmd.playSdRandomOnA:
        return 'Play Random WAV on CH A';
      case HumanCyborgRelationsCmd.playSdRandomOnB:
        return 'Play Random WAV on CH B';
      case HumanCyborgRelationsCmd.panicStop:
        return 'Sudden Stop';
      case HumanCyborgRelationsCmd.gracefulStop:
        return 'Graceful Stop';
      case HumanCyborgRelationsCmd.stopWavOnA:
        return 'Stop WAV on CH A';
      case HumanCyborgRelationsCmd.stopWavOnB:
        return 'Stop WAV on CH B';
      case HumanCyborgRelationsCmd.vocalizerVolume:
        return 'Vocalizer Volume';
      case HumanCyborgRelationsCmd.wavAVolume:
        return 'CH A Volume';
      case HumanCyborgRelationsCmd.wavBVolume:
        return 'CH B Volume';
      case HumanCyborgRelationsCmd.enableImprov:
        return 'Enable Improv';
      case HumanCyborgRelationsCmd.enableCanonical:
        return 'Enable Canonical';
      case HumanCyborgRelationsCmd.enablePersonalityOverride:
        return 'Enable Personality Override';
      case HumanCyborgRelationsCmd.disablePersonalityOverride:
        return 'Disable Personality Override';
      case HumanCyborgRelationsCmd.zeroEmotions:
        return 'Reset Emotions';
      case HumanCyborgRelationsCmd.setHappyLevel:
        return 'Set Happy Level';
      case HumanCyborgRelationsCmd.setSadLevel:
        return 'Set Sad Level';
      case HumanCyborgRelationsCmd.setMadLevel:
        return 'Set Angry Level';
      case HumanCyborgRelationsCmd.setScaredLevel:
        return 'Set Scared Level';
      default:
        return '';
    }
  }
}
