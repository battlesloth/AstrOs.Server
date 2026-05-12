import type { FirmwareControllerView, FirmwareStatusPillKind } from '@/types/firmware';

export type ControllerRowMode = 'select' | 'progress';

export interface ControllerRowProps {
  controller: FirmwareControllerView;
  target: string | null;
  mode: ControllerRowMode;
  /** Active in `select` mode. Ignored in `progress` mode. */
  selected: boolean;
  /** Status pill shown in `progress` mode. */
  progressStatus?: FirmwareStatusPillKind;
  /** Stage label rendered under the status pill in `progress` mode when updating. */
  stageLabel?: string;
}
