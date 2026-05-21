import type { PageButton, PageButtonType } from '@/models/remoteControl/pageButton';

export type FilledPageButton = PageButton & {
  type: Exclude<PageButtonType, 'none'>;
};

export type AstrosMobileRemotePressEvent = FilledPageButton;

// Exhaustive switch (not `type !== 'none'`) so a new PageButtonType variant
// breaks the build at the `never` assertion instead of being silently
// classified as filled and emitted through `press` to the parent.
export function isFilledPageButton(button: PageButton): button is FilledPageButton {
  switch (button.type) {
    case 'script':
    case 'playlist':
      return true;
    case 'none':
      return false;
    default: {
      const _exhaustive: never = button.type;
      return _exhaustive;
    }
  }
}
