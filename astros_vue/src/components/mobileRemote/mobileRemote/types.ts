import type { PageButton, PageButtonType } from '@/models/remoteControl/pageButton';

export type FilledPageButton = PageButton & {
  type: Exclude<PageButtonType, 'none'>;
};

export type AstrosMobileRemotePressEvent = FilledPageButton;

export function isFilledPageButton(button: PageButton): button is FilledPageButton {
  return button.type !== 'none';
}
