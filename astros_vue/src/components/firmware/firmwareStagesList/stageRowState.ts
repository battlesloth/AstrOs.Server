import type { FirmwarePhase, FirmwareStage } from '@/types/firmware';

export const FIRMWARE_STAGES = ['download', 'transfer', 'flash', 'verify', 'reboot'] as const;

export type StageRowState = 'idle' | 'done' | 'current' | 'failed';

export interface StageRowStateInput {
  stage: FirmwareStage;
  phase: FirmwarePhase;
  currentStage: FirmwareStage | null;
  failedStage: FirmwareStage | null;
}

/**
 * Derive the visual state for a single stage row given the overall phase and
 * the current/failed stage pointers.
 *
 * Conventions:
 * - `done` phase → every stage is `done`.
 * - `failed` phase + `failedStage` matches → that row is `failed`; earlier
 *   rows are `done`; later rows are `idle`.
 * - `flashing` phase + `currentStage` matches → that row is `current`;
 *   earlier rows are `done`; later rows are `idle`.
 * - `idle` / `select` phases or unknown pointer values → all `idle`.
 */
export function stageRowState(input: StageRowStateInput): StageRowState {
  const { stage, phase, currentStage, failedStage } = input;
  const index = FIRMWARE_STAGES.indexOf(stage);
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
