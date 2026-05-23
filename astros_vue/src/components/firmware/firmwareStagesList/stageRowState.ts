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
  if (phase === 'done') {
    // `phase === 'done'` means the job's lifecycle is terminal — not that
    // every stage completed successfully. Painting unreached stages green
    // misleads the operator when controllers fail before reaching the end
    // (e.g. the deploy stub returns all-FAILED at the `transfer` step).
    // Mirror the `flashing` branch: stages at or before `currentStage` are
    // `done`, beyond are `idle`. Per-controller failure still surfaces via
    // the row's pill.
    if (currentStage === null) return 'idle';
    const currentIndex = FIRMWARE_STAGES.indexOf(currentStage);
    if (currentIndex === -1) return 'idle';
    return index <= currentIndex ? 'done' : 'idle';
  }
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
