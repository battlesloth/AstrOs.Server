import type {
  FirmwareControllerView,
  FirmwareStageLabelKey,
  FirmwareStatusPillKind,
} from '@/types/firmware';

export type ControllerRowMode = 'select' | 'progress';

export interface ControllerRowProps {
  controller: FirmwareControllerView;
  target: string | null;
  mode: ControllerRowMode;
  /** Active in `select` mode. Ignored in `progress` mode. */
  selected: boolean;
  /**
   * Active in `select` mode. When true, a downgrade row's checkbox stays
   * enabled (operator has opted in via the panel's "Allow downgrades"
   * toggle); the red DOWNGRADE pill still renders. Hard-blocked rows
   * (status === 'down') stay disabled regardless.
   */
  allowDowngrade?: boolean;
  /** Status pill shown in `progress` mode. */
  progressStatus?: FirmwareStatusPillKind;
  /** i18n key path for the stage label rendered under the status pill in `progress` mode when updating. */
  stageLabelKey?: FirmwareStageLabelKey;
}
