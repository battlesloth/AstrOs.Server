import { HumanCyborgRelationsCmd } from "@/enums/scripts/humanCyborgRelations";

export function useHumanCyborgRelations() {

  function getHcrCommandString(cmd: HumanCyborgRelationsCmd): string {
    switch (cmd) {
      case HumanCyborgRelationsCmd.MILD_HAPPY:
        return 'SH0';
      case HumanCyborgRelationsCmd.EXTREME_HAPPY:
        return 'SH1';
      case HumanCyborgRelationsCmd.MILD_SAD:
        return 'SS0';
      case HumanCyborgRelationsCmd.EXTREME_SAD:
        return 'SS1';
      case HumanCyborgRelationsCmd.MILD_ANGRY:
        return 'SM0';
      case HumanCyborgRelationsCmd.EXTREME_ANGRY:
        return 'SM1';
      case HumanCyborgRelationsCmd.MILD_SCARED:
        return 'SC0';
      case HumanCyborgRelationsCmd.EXTREME_SCARED:
        return 'SC1';
      case HumanCyborgRelationsCmd.OVERLOAD:
        return 'SE';
      case HumanCyborgRelationsCmd.ENABLE_MUSE:
        return 'M1';
      case HumanCyborgRelationsCmd.DISABLE_MUSE:
        return 'M0';
      case HumanCyborgRelationsCmd.TOGGLE_MUSE:
        return 'MT';
      case HumanCyborgRelationsCmd.TRIGGER_MUSING:
        return 'MM';
      case HumanCyborgRelationsCmd.MIN_SECONDS_BETWEEN_MUSINGS:
        return 'MN#';
      case HumanCyborgRelationsCmd.MAX_SECONDS_BETWEEN_MUSINGS:
        return 'MX#';
      case HumanCyborgRelationsCmd.PLAY_WAV_ON_A:
        return 'CA#';
      case HumanCyborgRelationsCmd.PLAY_WAV_ON_B:
        return 'CB#';
      case HumanCyborgRelationsCmd.PLAY_SD_RANDOM_ON_A:
        return 'CA#C*';
      case HumanCyborgRelationsCmd.PLAY_SD_RANDOM_ON_B:
        return 'CB#C*';
      case HumanCyborgRelationsCmd.PANIC_STOP:
        return 'PSV';
      case HumanCyborgRelationsCmd.GRACEFUL_STOP:
        return 'PSG';
      case HumanCyborgRelationsCmd.STOP_WAV_ON_A:
        return 'PSA';
      case HumanCyborgRelationsCmd.STOP_WAV_ON_B:
        return 'PSB';
      case HumanCyborgRelationsCmd.VOCALIZER_VOLUME:
        return 'PVV#';
      case HumanCyborgRelationsCmd.WAV_A_VOLUME:
        return 'PVA#';
      case HumanCyborgRelationsCmd.WAV_B_VOLUME:
        return 'PVB#';
      case HumanCyborgRelationsCmd.ENABLE_IMPROV:
        return 'OA0';
      case HumanCyborgRelationsCmd.ENABLE_CANONICAL:
        return 'OA1';
      case HumanCyborgRelationsCmd.ENABLE_PERSONALITY_OVERRIDE:
        return 'O1';
      case HumanCyborgRelationsCmd.DISABLE_PERSONALITY_OVERRIDE:
        return 'O0';
      case HumanCyborgRelationsCmd.ZERO_EMOTIONS:
        return 'OR';
      case HumanCyborgRelationsCmd.SET_HAPPY_LEVEL:
        return 'OH#';
      case HumanCyborgRelationsCmd.SET_SAD_LEVEL:
        return 'OS#';
      case HumanCyborgRelationsCmd.SET_MAD_LEVEL:
        return 'OM#';
      case HumanCyborgRelationsCmd.SET_SCARED_LEVEL:
        return 'OC#';
      default:
        return '';
    }
  }

  function getHcrCommandName(cmd: HumanCyborgRelationsCmd) {
    switch (cmd) {
      case HumanCyborgRelationsCmd.MILD_HAPPY:
        return 'Mild Happy';
      case HumanCyborgRelationsCmd.EXTREME_HAPPY:
        return 'Extreme Happy';
      case HumanCyborgRelationsCmd.MILD_SAD:
        return 'Mild Sad';
      case HumanCyborgRelationsCmd.EXTREME_SAD:
        return 'Extreme ';
      case HumanCyborgRelationsCmd.MILD_ANGRY:
        return 'Mild Angry';
      case HumanCyborgRelationsCmd.EXTREME_ANGRY:
        return 'Extreme Angry';
      case HumanCyborgRelationsCmd.MILD_SCARED:
        return 'Mild Scared';
      case HumanCyborgRelationsCmd.EXTREME_SCARED:
        return 'Extreme Scared';
      case HumanCyborgRelationsCmd.OVERLOAD:
        return 'Overload';
      case HumanCyborgRelationsCmd.ENABLE_MUSE:
        return 'Enable Muse';
      case HumanCyborgRelationsCmd.DISABLE_MUSE:
        return 'DDisable Muse';
      case HumanCyborgRelationsCmd.TOGGLE_MUSE:
        return 'Toggle Muse';
      case HumanCyborgRelationsCmd.TRIGGER_MUSING:
        return 'Trigger Muse';
      case HumanCyborgRelationsCmd.MIN_SECONDS_BETWEEN_MUSINGS:
        return 'Min Seconds Between';
      case HumanCyborgRelationsCmd.MAX_SECONDS_BETWEEN_MUSINGS:
        return 'Max Seconds Between';
      case HumanCyborgRelationsCmd.PLAY_WAV_ON_A:
        return 'Play WAV on CH A';
      case HumanCyborgRelationsCmd.PLAY_WAV_ON_B:
        return 'Play WAV on CH B';
      case HumanCyborgRelationsCmd.PLAY_SD_RANDOM_ON_A:
        return 'Play Random WAV on CH A';
      case HumanCyborgRelationsCmd.PLAY_SD_RANDOM_ON_B:
        return 'Play Random WAV on CH B';
      case HumanCyborgRelationsCmd.PANIC_STOP:
        return 'Sudden Stop';
      case HumanCyborgRelationsCmd.GRACEFUL_STOP:
        return 'Graceful Stop';
      case HumanCyborgRelationsCmd.STOP_WAV_ON_A:
        return 'Stop WAV on CH A';
      case HumanCyborgRelationsCmd.STOP_WAV_ON_B:
        return 'Stop WAV on CH B';
      case HumanCyborgRelationsCmd.VOCALIZER_VOLUME:
        return 'Vocalizer Volume';
      case HumanCyborgRelationsCmd.WAV_A_VOLUME:
        return 'CH A Volume';
      case HumanCyborgRelationsCmd.WAV_B_VOLUME:
        return 'CH B Volume';
      case HumanCyborgRelationsCmd.ENABLE_IMPROV:
        return 'Enable Improv';
      case HumanCyborgRelationsCmd.ENABLE_CANONICAL:
        return 'Enable Canonical';
      case HumanCyborgRelationsCmd.ENABLE_PERSONALITY_OVERRIDE:
        return 'Enable Personality Override';
      case HumanCyborgRelationsCmd.DISABLE_PERSONALITY_OVERRIDE:
        return 'Disable Personality Override';
      case HumanCyborgRelationsCmd.ZERO_EMOTIONS:
        return 'Reset Emotions';
      case HumanCyborgRelationsCmd.SET_HAPPY_LEVEL:
        return 'Set Happy Level';
      case HumanCyborgRelationsCmd.SET_SAD_LEVEL:
        return 'Set Sad Level';
      case HumanCyborgRelationsCmd.SET_MAD_LEVEL:
        return 'Set Angry Level';
      case HumanCyborgRelationsCmd.SET_SCARED_LEVEL:
        return 'Set Scared Level';
    }
  }

  return {
    getHcrCommandString,
    getHcrCommandName,
  };

}