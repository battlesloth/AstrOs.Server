export type PageButtonType = 'script' | 'playlist' | 'none';

export interface PageButton {
  id: string;
  name: string;
  type: PageButtonType;
}

// Sentinel for an unassigned slot. Shape matches what the firmware sync
// path expects on the wire ({name: 'None', command: '0'} after serialization)
// — see remote_config_controller. Display surfaces should NOT render the
// `name` field of this sentinel directly; they should use the i18n key for
// the "None" label so the sentinel stays language-neutral on the wire.
export const NONE_BUTTON: PageButton = { id: '0', name: 'None', type: 'none' };
