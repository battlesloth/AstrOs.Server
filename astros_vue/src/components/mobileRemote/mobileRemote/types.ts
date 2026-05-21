import type { PageButton, PageButtonType } from '@/models/remoteControl/pageButton';

// A PageButton narrowed to the filled variants — emitted by AstrosMobileRemote
// when an operator taps a non-empty button. The component filters out
// `type: 'none'` slots before emitting (see handlePress in AstrosMobileRemote.vue),
// so the parent never needs to re-check; TypeScript narrows `type` to
// 'script' | 'playlist' directly and the parent can switch on it without a
// dead `none` branch.
export type FilledPageButton = PageButton & {
  type: Exclude<PageButtonType, 'none'>;
};

export type AstrosMobileRemotePressEvent = FilledPageButton;
