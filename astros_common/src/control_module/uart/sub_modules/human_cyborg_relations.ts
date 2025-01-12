import { HumanCyborgRelationsCmd } from "../../../astros_enums";

export class HumanCyborgRelationsModule {
  static getCommandString(cmd: HumanCyborgRelationsCmd): string {
    switch (cmd) {
      case HumanCyborgRelationsCmd.mildHappy:
        return "SH0";
      case HumanCyborgRelationsCmd.extremeHappy:
        return "SH1";
      case HumanCyborgRelationsCmd.mildSad:
        return "SS0";
      case HumanCyborgRelationsCmd.extremeSad:
        return "SS1";
      case HumanCyborgRelationsCmd.mildAngry:
        return "SM0";
      case HumanCyborgRelationsCmd.extremeAngry:
        return "SM1";
      case HumanCyborgRelationsCmd.mildScared:
        return "SC0";
      case HumanCyborgRelationsCmd.extremeScared:
        return "SC1";
      case HumanCyborgRelationsCmd.overload:
        return "SE";
      case HumanCyborgRelationsCmd.enableMuse:
        return "M1";
      case HumanCyborgRelationsCmd.disableMuse:
        return "M0";
      case HumanCyborgRelationsCmd.toggleMuse:
        return "MT";
      case HumanCyborgRelationsCmd.triggerMusing:
        return "MM";
      case HumanCyborgRelationsCmd.minSecondsBetweenMusings:
        return "MN#";
      case HumanCyborgRelationsCmd.maxSecondsBetweenMusings:
        return "MX#";
      case HumanCyborgRelationsCmd.playWavOnA:
        return "CA#";
      case HumanCyborgRelationsCmd.playWavOnB:
        return "CB#";
      case HumanCyborgRelationsCmd.playSdRandomOnA:
        return "CA#C*";
      case HumanCyborgRelationsCmd.playSdRandomOnB:
        return "CB#C*";
      case HumanCyborgRelationsCmd.panicStop:
        return "PSV";
      case HumanCyborgRelationsCmd.gracefulStop:
        return "PSG";
      case HumanCyborgRelationsCmd.stopWavOnA:
        return "PSA";
      case HumanCyborgRelationsCmd.stopWavOnB:
        return "PSB";
      case HumanCyborgRelationsCmd.vocalizerVolume:
        return "PVV#";
      case HumanCyborgRelationsCmd.wavAVolume:
        return "PVA#";
      case HumanCyborgRelationsCmd.wavBVolume:
        return "PVB#";
      case HumanCyborgRelationsCmd.enableImprov:
        return "OA0";
      case HumanCyborgRelationsCmd.enableCanonical:
        return "OA1";
      case HumanCyborgRelationsCmd.enablePersonalityOverride:
        return "O1";
      case HumanCyborgRelationsCmd.disablePersonalityOverride:
        return "O0";
      case HumanCyborgRelationsCmd.zeroEmotions:
        return "OR";
      case HumanCyborgRelationsCmd.setHappyLevel:
        return "OH#";
      case HumanCyborgRelationsCmd.setSadLevel:
        return "OS#";
      case HumanCyborgRelationsCmd.setMadLevel:
        return "OM#";
      case HumanCyborgRelationsCmd.setScaredLevel:
        return "OC#";
      default:
        return "";
    }
  }

  static getCommandName(cmd: HumanCyborgRelationsCmd) {
    switch (cmd) {
      case HumanCyborgRelationsCmd.mildHappy:
        return "Mild Happy";
      case HumanCyborgRelationsCmd.extremeHappy:
        return "Extreme Happy";
      case HumanCyborgRelationsCmd.mildSad:
        return "Mild Sad";
      case HumanCyborgRelationsCmd.extremeSad:
        return "Extreme ";
      case HumanCyborgRelationsCmd.mildAngry:
        return "Mild Angry";
      case HumanCyborgRelationsCmd.extremeAngry:
        return "Extreme Angry";
      case HumanCyborgRelationsCmd.mildScared:
        return "Mild Scared";
      case HumanCyborgRelationsCmd.extremeScared:
        return "Extreme Scared";
      case HumanCyborgRelationsCmd.overload:
        return "Overload";
      case HumanCyborgRelationsCmd.enableMuse:
        return "Enable Muse";
      case HumanCyborgRelationsCmd.disableMuse:
        return "DIsable Muse";
      case HumanCyborgRelationsCmd.toggleMuse:
        return "Toggle Muse";
      case HumanCyborgRelationsCmd.triggerMusing:
        return "Trigger Muse";
      case HumanCyborgRelationsCmd.minSecondsBetweenMusings:
        return "Min Seconds Between";
      case HumanCyborgRelationsCmd.maxSecondsBetweenMusings:
        return "Max Seconds Between";
      case HumanCyborgRelationsCmd.playWavOnA:
        return "Play WAV on CH A";
      case HumanCyborgRelationsCmd.playWavOnB:
        return "Play WAV on CH B";
      case HumanCyborgRelationsCmd.playSdRandomOnA:
        return "Play Random WAV on CH A";
      case HumanCyborgRelationsCmd.playSdRandomOnB:
        return "Play Random WAV on CH B";
      case HumanCyborgRelationsCmd.panicStop:
        return "Sudden Stop";
      case HumanCyborgRelationsCmd.gracefulStop:
        return "Graceful Stop";
      case HumanCyborgRelationsCmd.stopWavOnA:
        return "Stop WAV on CH A";
      case HumanCyborgRelationsCmd.stopWavOnB:
        return "Stop WAV on CH B";
      case HumanCyborgRelationsCmd.vocalizerVolume:
        return "Vocalizer Volume";
      case HumanCyborgRelationsCmd.wavAVolume:
        return "CH A Volume";
      case HumanCyborgRelationsCmd.wavBVolume:
        return "CH B Volume";
      case HumanCyborgRelationsCmd.enableImprov:
        return "Enable Improv";
      case HumanCyborgRelationsCmd.enableCanonical:
        return "Enable Canonical";
      case HumanCyborgRelationsCmd.enablePersonalityOverride:
        return "Enable Personality Override";
      case HumanCyborgRelationsCmd.disablePersonalityOverride:
        return "Disable Personality Override";
      case HumanCyborgRelationsCmd.zeroEmotions:
        return "Reset Emotions";
      case HumanCyborgRelationsCmd.setHappyLevel:
        return "Set Happy Level";
      case HumanCyborgRelationsCmd.setSadLevel:
        return "Set Sad Level";
      case HumanCyborgRelationsCmd.setMadLevel:
        return "Set Angry Level";
      case HumanCyborgRelationsCmd.setScaredLevel:
        return "Set Scared Level";
    }
  }
}
