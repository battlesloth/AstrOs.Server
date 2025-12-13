export enum HumanCyborgRelationsCmd {
  mildHappy = 1,
  extremeHappy = 2,
  mildSad = 3,
  extremeSad = 4,
  mildAngry = 5,
  extremeAngry = 6,
  mildScared = 7,
  extremeScared = 8,
  overload = 9,
  enableMuse = 10,
  disableMuse = 11,
  toggleMuse = 12,
  triggerMusing = 13,
  minSecondsBetweenMusings = 14,
  maxSecondsBetweenMusings = 15,
  playWavOnA = 16,
  playWavOnB = 17,
  playSdRandomOnA = 18,
  playSdRandomOnB = 19,
  panicStop = 20,
  gracefulStop = 21,
  stopWavOnA = 22,
  stopWavOnB = 23,
  vocalizerVolume = 24,
  wavAVolume = 25,
  wavBVolume = 26,
  enableImprov = 27,
  enableCanonical = 28,
  enablePersonalityOverride = 29,
  disablePersonalityOverride = 30,
  zeroEmotions = 31,
  setHappyLevel = 32,
  setSadLevel = 33,
  setMadLevel = 34,
  setScaredLevel = 35,
}

export function getHcrCommandString(cmd: HumanCyborgRelationsCmd): string {
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

export function getHcrCommandName(cmd: HumanCyborgRelationsCmd) {
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
