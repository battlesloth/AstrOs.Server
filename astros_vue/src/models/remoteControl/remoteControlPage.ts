import type { PageButton } from './pageButton';

export interface RemoteControlPage {
  id: string;
  name: string;
  button1: PageButton;
  button2: PageButton;
  button3: PageButton;
  button4: PageButton;
  button5: PageButton;
  button6: PageButton;
  button7: PageButton;
  button8: PageButton;
  button9: PageButton;
}

export const BUTTON_KEYS = [
  'button1',
  'button2',
  'button3',
  'button4',
  'button5',
  'button6',
  'button7',
  'button8',
  'button9',
] as const satisfies readonly (keyof Omit<RemoteControlPage, 'id' | 'name'>)[];

export type ButtonKey = (typeof BUTTON_KEYS)[number];
