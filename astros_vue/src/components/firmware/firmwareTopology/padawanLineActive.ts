import type { TopologyPhase, TopologyStage } from './types';

/**
 * Returns true when the master → padawan line should animate (dashed +
 * flowing). The animation represents ESP-NOW byte flow from the master
 * out to its padawans — only happens once the orchestrator finishes the
 * serial UART upload and dispatches FW_DEPLOY_BEGIN.
 *
 * `currentStage === 'download'` (UPLOADING_TO_MASTER) and `null` (no
 * controller-update yet) both mean we're still in the serial-upload
 * phase; everything past `'download'` means deploy has begun.
 */
export function isPadawanLineActive(
  phase: TopologyPhase,
  currentStage: TopologyStage | null | undefined,
): boolean {
  if (phase !== 'flashing') return false;
  if (currentStage === null || currentStage === undefined) return false;
  return currentStage !== 'download';
}
