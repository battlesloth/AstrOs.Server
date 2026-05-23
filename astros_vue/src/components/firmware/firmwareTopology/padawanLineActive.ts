import type { TopologyPhase, TopologyStage } from './types';

/**
 * Returns true when the master → padawan line should animate (dashed +
 * flowing). The line represents ESP-NOW byte flow from the master out to
 * its padawans, which only happens once the orchestrator has finished the
 * serial upload (server → master via UART) and started the deploy step.
 *
 * Mapping back to server-side stages:
 *   - `currentStage === null`  — phase just flipped to 'flashing', no
 *                                controller-update events yet. Treat as
 *                                still-in-serial-upload (no padawan flow).
 *   - `currentStage === 'download'` — UPLOADING_TO_MASTER, i.e. UART
 *                                transfer. No padawan flow yet.
 *   - any other stage — the orchestrator has transitioned controllers to
 *                       SENDING (FW_DEPLOY_BEGIN dispatched) or beyond.
 *                       Padawan ESP-NOW traffic is now plausible.
 *
 * Non-`'flashing'` phases never animate.
 */
export function isPadawanLineActive(
  phase: TopologyPhase,
  currentStage: TopologyStage | null | undefined,
): boolean {
  if (phase !== 'flashing') return false;
  if (currentStage === null || currentStage === undefined) return false;
  return currentStage !== 'download';
}
