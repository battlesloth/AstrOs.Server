import type { FirmwarePhase, FirmwareStage } from '@/types/firmware';

export const FIRMWARE_STAGES = ['download', 'transfer', 'flash', 'verify', 'reboot'] as const;

export type StageRowState = 'idle' | 'done' | 'current' | 'failed';

export interface StageRowStateInput {
  stage: FirmwareStage;
  phase: FirmwarePhase;
  currentStage: FirmwareStage | null;
  failedStage: FirmwareStage | null;
}

export function stageRowState(input: StageRowStateInput): StageRowState {
  const { stage, phase, currentStage, failedStage } = input;
  const index = FIRMWARE_STAGES.indexOf(stage);
  // `phase === 'done'` is a fully-successful job — any controller failure
  // gets routed to `phase === 'failed'` by the firmware store at
  // applyJobDone time, where the failedStage branch below renders the
  // partial-completion correctly.
  if (phase === 'done') return 'done';
  if (phase === 'failed') {
    if (failedStage === null) return 'idle';
    const failedIndex = FIRMWARE_STAGES.indexOf(failedStage);
    if (failedIndex === -1) return 'idle';
    if (index < failedIndex) return 'done';
    if (index === failedIndex) return 'failed';
    return 'idle';
  }
  if (phase === 'flashing') {
    if (currentStage === null) return 'idle';
    const currentIndex = FIRMWARE_STAGES.indexOf(currentStage);
    if (currentIndex === -1) return 'idle';
    if (index < currentIndex) return 'done';
    if (index === currentIndex) return 'current';
    return 'idle';
  }
  return 'idle';
}
