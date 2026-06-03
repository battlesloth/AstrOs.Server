export type PageButtonType = 'script' | 'playlist' | 'none';

export interface PageButton {
  id: string;
  name: string;
  type: PageButtonType;
}

// Factory for an unassigned-slot sentinel. Returns a fresh object each call so
// downstream code that does `page[buttonKey] = makeNoneButton()` can't share
// identity with the next caller — in-place mutations like
// `page.button1.name = '...'` (a documented consumer pattern) would otherwise
// poison every other "None" slot that happened to share the reference.
//
// Shape matches what the firmware sync path expects on the wire — the
// serializer in remote_config_controller maps `id` → `command`, producing
// `{name: 'None', command: '0'}`. Display surfaces should NOT render the
// `name` field directly; they should use the i18n key for the "None" label
// so the sentinel stays language-neutral on the wire.
export function makeNoneButton(): PageButton {
  return { id: '0', name: 'None', type: 'none' };
}
