import { compareTags } from '@/utils/version';
import type { FirmwareControllerView, FirmwareStatusPillKind } from '@/types/firmware';

export interface SelectModePillInput {
  controller: FirmwareControllerView;
  target: string | null;
}

/**
 * Right-column pill in select mode. Priority: offline > downgrade > upToDate > none.
 * Order matters — an offline controller whose current happens to equal target must
 * render as offline (so the operator sees it can't participate), not upToDate.
 *
 * Returns null when the row should render no pill on the right (typical "upgrade
 * waiting to be selected" state).
 */
export function selectModePillKind(input: SelectModePillInput): FirmwareStatusPillKind | null {
  const { controller, target } = input;
  if (controller.status === 'down') return 'offline';
  if (target !== null) {
    const cmp = compareTags(controller.current, target);
    if (!Number.isNaN(cmp) && cmp > 0) return 'downgrade';
    if (target === controller.current) return 'upToDate';
  }
  return null;
}
