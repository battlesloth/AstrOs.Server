import type { TopologyPhase } from './types';

export const TOPOLOGY_STROKE_COLORS = {
  unselected: '#cbd5dd',
  success: '#3aa676',
  failure: '#cf4242',
  masterFlashing: '#e5a93a',
  padawanFlashing: '#7d92b8',
  selectedDefault: '#2a5a97',
} as const;

export interface StrokeForInput {
  controllerId: string;
  isSelected: boolean;
  isMaster: boolean;
  phase: TopologyPhase;
  failedControllerId: string | undefined;
}

export function strokeFor(input: StrokeForInput): string {
  const { controllerId, isSelected, isMaster, phase, failedControllerId } = input;
  if (!isSelected) return TOPOLOGY_STROKE_COLORS.unselected;
  if (phase === 'done') return TOPOLOGY_STROKE_COLORS.success;
  if (phase === 'failed') {
    return controllerId === failedControllerId
      ? TOPOLOGY_STROKE_COLORS.failure
      : TOPOLOGY_STROKE_COLORS.success;
  }
  if (phase === 'flashing' && isMaster) return TOPOLOGY_STROKE_COLORS.masterFlashing;
  if (phase === 'flashing') return TOPOLOGY_STROKE_COLORS.padawanFlashing;
  return TOPOLOGY_STROKE_COLORS.selectedDefault;
}
